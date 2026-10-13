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
  const srv = spawn('npx', ['http-server', 'site', '-p', '8766', '-s', '-c-1'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errs = [];
  const phone = async name => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await ctx.route('https://api.github.com/**', handler); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message)); await p.goto('http://localhost:8766/'); await p.waitForTimeout(1800); if (await p.locator('#news-close').count()) await p.click('#news-close'); return { ctx, p }; };
  const B = await phone('B'), A = await phone('A');
  // B hat schon eigene Einträge (vor dem Verbinden)
  await add(B.p, 12, '854', 'B-1'); await add(B.p, 3, '091', 'B-2');
  // falscher Schlüssel
  await connect(B.p, 'github_pat_FALSCH');
  console.log('1 Falscher Schlüssel:', await B.p.locator('#syncline').innerText(), '| Formular aktiv:', !(await B.p.locator('#sync-form').evaluate(f => f.hidden)));
  await connect(B.p, TOKEN);
  console.log('2 B verbunden:', await B.p.locator('#syncline').innerText(), '| Remote:', remoteKeys());
  await connect(A.p, TOKEN);
  console.log('3 A verbunden, A Gasse 12:', JSON.stringify(await gasse(A.p, 12).innerText()), '| A Gasse 27:', JSON.stringify(await gasse(A.p, 27).innerText()));
  // A trägt ein, B gleicht ab
  await add(A.p, 5, '793', 'A-1'); await A.p.waitForTimeout(1800);
  await syncBtn(B.p);
  console.log('4 B sieht A-Eintrag, Gasse 5:', JSON.stringify(await gasse(B.p, 5).innerText()));
  // Löschen auf A kommt bei B an
  await gasse(A.p, 12).click(); await A.p.getByRole('button', { name: 'Entfernen', exact: true }).click(); await A.p.getByRole('button', { name: 'Wirklich entfernen?' }).click(); await A.p.click('#close'); await A.p.waitForTimeout(400);
  await A.p.waitForTimeout(1800); await syncBtn(B.p);
  console.log('5 Nach Löschen auf A, B Gasse 12:', JSON.stringify(await gasse(B.p, 12).innerText()), '| Remote:', remoteKeys());
  // Netz weg: beide tragen ein, ohne sich abzugleichen
  remote.down = true;
  await add(A.p, 20, '855', 'A-gleich'); await add(B.p, 21, '794', 'B-gleich'); await add(B.p, 8, '588', 'OFF-1');
  await A.p.waitForTimeout(1800);
  console.log('6 Ohne Netz, B:', await B.p.locator('#syncline').innerText(), '|', await B.p.locator('#syncline').getAttribute('title'));
  // Netz zurück: beide gleichzeitig
  remote.down = false;
  await Promise.all([settings(A.p, true), settings(B.p, true)]); await Promise.all([A.p.click('#sync-now'), B.p.click('#sync-now')]); await Promise.all([settings(A.p, false), settings(B.p, false)]);
  await A.p.waitForTimeout(2500); await syncBtn(A.p); await syncBtn(B.p);
  console.log('7 Gleichzeitig: Remote', remoteKeys(), '| Konflikte aufgelöst:', remote.conflicts);
  console.log('  A Gasse 21:', JSON.stringify(await gasse(A.p, 21).innerText()), '| B Gasse 20:', JSON.stringify(await gasse(B.p, 20).innerText()), '| B:', await B.p.locator('#syncline').innerText());
  // Neustart von A: alles noch da, Schlüssel gemerkt
  await A.p.reload(); await A.p.waitForTimeout(1000);
  console.log('9 A nach Neustart:', await A.p.locator('#syncline').innerText(), '| Gasse 8:', JSON.stringify(await gasse(A.p, 8).innerText()));
  console.log('Schreibvorgänge:', remote.puts, '| Fehler:', errs);
  await browser.close(); srv.kill();
})();
