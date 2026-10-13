const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { spawn } = require('child_process');
const crypto = require('crypto');
const TOKEN = 'github_pat_TEST1234567890abcdef';
// nachgebautes GitHub: eine Datei mit sha
const remote = { content: null, sha: null, puts: 0, conflicts: 0 };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'ETag', 'Content-Type': 'application/json' };
async function handler(route) {
  if (remote.down) return route.abort('internetdisconnected');
  const req = route.request(); const url = req.url(); const h = req.headers();
  if (h['authorization'] !== 'Bearer ' + TOKEN) return route.fulfill({ status: 401, headers: cors, body: '{"message":"Bad credentials"}' });
  if (url.endsWith('/gassenplan-daten')) return route.fulfill({ status: 200, headers: cors, body: '{"name":"gassenplan-daten"}' });
  if (req.method() === 'GET') {
    if (!remote.content) return route.fulfill({ status: 404, headers: cors, body: '{"message":"Not Found"}' });
    const etag = '"' + remote.sha + '"';
    if (h['if-none-match'] === etag) return route.fulfill({ status: 304, headers: cors, body: '' });
    return route.fulfill({ status: 200, headers: { ...cors, ETag: etag }, body: JSON.stringify({ sha: remote.sha, content: Buffer.from(remote.content).toString('base64') }) });
  }
  if (req.method() === 'PUT') {
    const b = JSON.parse(req.postData());
    if ((b.sha || null) !== remote.sha) { remote.conflicts++; return route.fulfill({ status: 409, headers: cors, body: '{"message":"conflict"}' }); }
    remote.content = Buffer.from(b.content, 'base64').toString('utf8');
    remote.sha = crypto.createHash('sha1').update(remote.content).digest('hex'); remote.puts++;
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ content: { sha: remote.sha } }) });
  }
  route.fulfill({ status: 405, headers: cors, body: '{}' });
}
const gasse = (p, n) => p.locator('.g:not(.half)', { has: p.locator('.plate', { hasText: new RegExp('^' + n + '$') }) });
async function add(p, n, m, c) {
  await gasse(p, n).click();
  await p.getByRole('button', { name: '+ ' + m }).click();
  if (c) { await p.locator('.model', { hasText: m }).locator('input').fill(c); await p.locator('.model', { hasText: m }).getByRole('button', { name: 'Eintragen' }).click(); }
  await p.click('#close'); await p.waitForTimeout(400);
}
async function settings(p, on) { if (on) { await p.click('#open-settings'); } else { await p.click('#close-settings'); } await p.waitForTimeout(420); }
async function connect(p, t) { await settings(p, true); await p.fill('#sync-token', t); await p.click('#sync-form button'); await p.waitForTimeout(600); await settings(p, false); }
async function syncBtn(p) { await settings(p, true); await p.click('#sync-now'); await p.waitForTimeout(600); await settings(p, false); }
const remoteKeys = () => remote.content ? Object.keys(JSON.parse(remote.content).belegung).sort().join(',') : '-';
(async () => {
  const srv = spawn('npx', ['http-server', 'site', '-p', '8767', '-s', '-c-1'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errs = [];
  const phone = async name => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await ctx.route('https://api.github.com/**', handler); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message)); await p.goto('http://localhost:8767/'); await p.waitForTimeout(1800); if (await p.locator('#news-close').count()) await p.click('#news-close'); return { ctx, p }; };
  const A = await phone('A'), B = await phone('B');
  const reveal = async p => { const v = p.locator('.wrap > .version'); await v.scrollIntoViewIfNeeded(); for (let i = 0; i < 5; i++) await v.click({ force: true }); await p.waitForTimeout(900); };
  await connect(A.p, TOKEN); await connect(B.p, TOKEN);
  // A legt den Admin-Schlüssel fest (versteckter Zugang)
  await reveal(A.p);
  const st0 = await A.p.locator('#admin-status').innerText();
  await A.p.fill('#admin-pw', 'geheim123'); await A.p.fill('#admin-pw2', 'geheim123'); await A.p.click('#admin-go'); await A.p.waitForTimeout(2500);
  const st1 = await A.p.locator('#admin-status').innerText();
  await settings(A.p, false);
  await A.p.waitForTimeout(1500); await syncBtn(B.p);
  // Änderungen auf beiden Handys
  await add(A.p, 5, '793', 'C-777');
  await gasse(B.p, 12).click(); await B.p.locator('#sheet-body .chip.belegt').click(); await B.p.click('#close'); await B.p.waitForTimeout(400);
  await A.p.waitForTimeout(2000); await B.p.waitForTimeout(500); await syncBtn(B.p); await syncBtn(A.p);
  // A öffnet den Verlauf
  await settings(A.p, true);
  await A.p.fill('#admin-pw', 'geheim123'); await A.p.click('#admin-go'); await A.p.waitForTimeout(1500);
  const logA = await A.p.locator('#admin-log').innerText();
  const versions = (await A.p.locator('#admin-versions').innerText()).split('\n').slice(0, 2).join(' | ');
  await A.p.locator('#settings .sheet-body').screenshot({ path: 'admin-shot.png' });
  // B: falscher Schlüssel, dann richtiger
  await reveal(B.p);
  await B.p.fill('#admin-pw', 'falsch99'); await B.p.click('#admin-go'); await B.p.waitForTimeout(1500);
  const wrong = { toast: await B.p.locator('#toast').innerText(), offen: await B.p.locator('#admin-view').isVisible() };
  await B.p.fill('#admin-pw', 'geheim123'); await B.p.click('#admin-go'); await B.p.waitForTimeout(1500);
  const right = await B.p.locator('#admin-view').isVisible();
  const remoteText = remote.content || '';
  const plain = ['793', 'C-777', 'Belegt', 'Gasse'].filter(w => JSON.stringify(JSON.parse(remoteText).log || []).includes(w));
  const logCount = (JSON.parse(remoteText).log || []).length;
  console.log(JSON.stringify({ st0, st1, logA, versions, wrong, right, logCount, klartextImLog: plain }, null, 1));
  console.log('Fehler:', errs);
  await browser.close(); srv.kill();
})();
