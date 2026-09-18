const admin = require('firebase-admin');

const rawServiceAccount = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
function parseServiceAccount(raw) {
  try { return JSON.parse(raw); } catch (_) {}
  const match = raw.match(/"private_key"\s*:\s*"([\s\S]*?)"\s*,\s*"client_email"/);
  if (!match) throw new Error('Invalid Firebase service-account JSON');
  const fixedKey = match[1].replace(/\\n/g, '\n').replace(/\r?\n/g, '\n');
  const repaired = raw.replace(match[0], `"private_key":${JSON.stringify(fixedKey)},"client_email"`);
  return JSON.parse(repaired);
}
const serviceAccount = parseServiceAccount(rawServiceAccount.startsWith('{')
  ? rawServiceAccount
  : Buffer.from(rawServiceAccount, 'base64').toString('utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  if (!token || !chatId) throw new Error('Telegram bot settings are missing');

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
    const text = `<b>${esc(title)}</b>\n\n⚽ <b>المباراة</b>\n<code>${esc(x.home)} × ${esc(x.away)}</code>\n\n<blockquote><b>🎯 التوقع:</b> ${esc(x.prediction)}</blockquote>\n\n<b>📊 الثقة:</b> ${esc(x.confidence)}%\n🕘 الموعد: ${esc(x.date)}\n🏆 البطولة: ${esc(x.league)}\n\n<i>${esc(note)}</i>\n\n🔗 <a href="https://raedemed.github.io/RA3D-BET-VIP/">عرض التفاصيل</a>`;
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
