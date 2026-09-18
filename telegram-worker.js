const admin = require('firebase-admin');

const rawServiceAccount = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
function parseServiceAccount(raw) {
  let account;
  try { account = JSON.parse(raw); } catch (_) {
    const match = raw.match(/"private_key"\s*:\s*"([\s\S]*?)"\s*,\s*"client_email"/);
    if (!match) throw new Error('Invalid Firebase service-account JSON');
    const fixedKey = match[1].replace(/\\n/g, '\n').replace(/\r?\n/g, '\n');
    const repaired = raw.replace(match[0], `"private_key":${JSON.stringify(fixedKey)},"client_email"`);
    account = JSON.parse(repaired);
  }
  if (!account || typeof account !== 'object' || !account.private_key || !account.client_email) {
    throw new Error('Firebase service-account JSON is missing private_key or client_email');
  }
  // GitHub secrets are sometimes saved with literal "\\n" sequences, escaped
  // unicode line breaks, CRLFs, or extra text around the PEM block. Normalize
  // and isolate the PEM before firebase-admin hands it to OpenSSL.
  let privateKey = String(account.private_key)
    .replace(/\\+n/g, '\n')
    .replace(/\\+r/g, '\r')
    .replace(/\\u000a/gi, '\n')
    .replace(/\\u000d/gi, '\r')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  const pemStart = privateKey.indexOf('-----BEGIN ');
  const pemEnd = privateKey.indexOf('-----END PRIVATE KEY-----');
  if (pemStart >= 0 && pemEnd >= pemStart) {
    privateKey = privateKey.slice(pemStart, pemEnd + '-----END PRIVATE KEY-----'.length);
  }
  account.private_key = privateKey.replace(/[ \t]+\n/g, '\n').trim() + '\n';
  return account;
}
const serviceAccount = parseServiceAccount(rawServiceAccount.startsWith('{')
  ? rawServiceAccount
  : Buffer.from(rawServiceAccount, 'base64').toString('utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function confidenceBar(value) {
  const n = Math.max(0, Math.min(100, Number(value) || 0));
  const filled = Math.round(n / 20);
  return '█'.repeat(filled) + '░'.repeat(5 - filled);
}
function predictionLines(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return items.map((item, index) => {
    const prob = Math.max(0, Math.min(100, Number(item.prob) || 0));
    return `${index + 1}. <b>${esc(item.label)}</b>\n   <code>${esc(item.text)}</code>  <b>${prob}%</b> <i>${confidenceBar(prob)}</i>`;
  }).join('\n');
}

async function main() {
  const settingsSnap = await db.collection('config').doc('settings').get();
  const settings = settingsSnap.data() || {};
  const cfg = settings.telegramAuto || {};
  if (cfg.enabled !== true) return console.log('Telegram prediction delivery disabled');

  const privateSnap = await db.collection('private').doc('telegram').get();
  const telegram = privateSnap.data() || {};
  const token = telegram.token || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = telegram.chatId || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error('Telegram bot settings are missing: save Bot Token and Chat ID from the admin panel');

  const dailyLimit = Math.max(1, Number(cfg.dailyLimit || 20));
  const day = new Date().toISOString().slice(0, 10);
  const sentToday = await db.collection('telegramSent').where('day', '==', day).limit(dailyLimit).get();
  let sentCount = sentToday.size;
  if (sentCount >= dailyLimit) return console.log('Daily Telegram limit reached');

  const queueSnap = await db.collection('telegramQueue').where('status', '==', 'pending').limit(50).get();
  const queue = queueSnap.docs.sort((a, b) => Number(a.data().queuedAt || 0) - Number(b.data().queuedAt || 0));
  for (const item of queue) {
    if (sentCount >= dailyLimit) break;
    const claim = await db.runTransaction(async tx => {
      const ref = db.collection('telegramQueue').doc(item.id);
      const snap = await tx.get(ref);
      const data = snap.data() || {};
      if (!snap.exists || data.status !== 'pending') return false;
      tx.update(ref, { status: 'sending', sendingAt: Date.now() });
      return true;
    });
    if (!claim) continue;

    const x = item.data();
    const title = cfg.title || '🏆 RA3D BET | توقع جديد';
    const note = cfg.note || 'التوقعات إحصائية وليست ضمانًا للنتيجة.';
    const allPredictions = predictionLines(x.predictions);
    const text = `<b>╔══════════════════╗</b>\n<b>   ${esc(title)}   </b>\n<b>╚══════════════════╝</b>\n\n⚽ <b>مباراة اليوم</b>\n<code>${esc(x.home)}  ×  ${esc(x.away)}</code>\n🏆 ${esc(x.league)}\n🕘 ${esc(x.date)}\n\n<blockquote>🛡️ <b>التوقع الأضمن</b>\n<code>${esc(x.prediction)}</code>\n📊 <b>الثقة: ${esc(x.confidence)}%</b>\n<i>${confidenceBar(x.confidence)}</i></blockquote>\n\n<b>📋 كل التوقعات والأسواق</b>\n${allPredictions || '<i>لا توجد أسواق إضافية.</i>'}\n\n<b>━━━━━━━━━━━━━━━━</b>\n<i>⚠️ ${esc(note)}</i>\n🔗 <a href="https://raedemed.github.io/2R3-RAE-VIP/">عرض التفاصيل كاملة</a>\n<b>𝙍𝘼𝟯𝘿 𝘽𝙀𝙏 • VIP</b>`;
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      await db.collection('telegramQueue').doc(item.id).update({ status: 'pending', lastError: result.description || `HTTP ${response.status}`, failedAt: Date.now() });
      console.error('Telegram send failed', result);
      continue;
    }
    await db.collection('telegramQueue').doc(item.id).update({ status: 'sent', sentAt: Date.now(), telegramMessageId: result.result?.message_id || null });
    await db.collection('telegramSent').doc(item.id).set({ queueId: item.id, day, sentAt: Date.now(), telegramMessageId: result.result?.message_id || null });
    sentCount++;
    console.log(`Sent ${item.id}`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
