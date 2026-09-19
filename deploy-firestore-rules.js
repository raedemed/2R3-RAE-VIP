const fs = require('fs');
const { GoogleAuth } = require('google-auth-library');

async function main() {
  const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
  const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const tokenResult = await client.getAccessToken();
  const token = typeof tokenResult === 'string' ? tokenResult : tokenResult.token;
  if (!token) throw new Error('Could not obtain Google access token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  const rulesetResponse = await fetch('https://firebaserules.googleapis.com/v1/projects/ra3d-bet/rulesets', {
    method: 'POST', headers,
    body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: rules }] } })
  });
  const rulesetBody = await rulesetResponse.json();
  if (!rulesetResponse.ok) throw new Error(`Ruleset create failed: ${JSON.stringify(rulesetBody)}`);
  const releaseResponse = await fetch('https://firebaserules.googleapis.com/v1/projects/ra3d-bet/releases', {
    method: 'POST', headers,
    body: JSON.stringify({ name: 'projects/ra3d-bet/releases/cloud.firestore', rulesetName: rulesetBody.name })
  });
  const releaseBody = await releaseResponse.json();
  if (!releaseResponse.ok) throw new Error(`Release failed: ${JSON.stringify(releaseBody)}`);
  console.log(`Firestore rules released: ${rulesetBody.name}`);
}
main().catch(error => { console.error(error.message); process.exit(1); });
