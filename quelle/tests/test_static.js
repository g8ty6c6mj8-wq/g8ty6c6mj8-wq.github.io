const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const f = 'file://' + process.cwd() + '/Gassenplan.html';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  // wie die iPhone-Vorschau: ohne Skript
  const p1 = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, javaScriptEnabled: false, offline: true })).newPage();
  await p1.goto(f);
  console.log('Ohne Skript: Gassen', await p1.locator('.g:not(.half)').count(), '| Chips', await p1.locator('#model-chips .chip').count(), '|', await p1.locator('#stand').innerText(), '| G27:', JSON.stringify(await p1.locator('#left .g', { hasText: '27' }).first().innerText()));
  await p1.screenshot({ path: 'static-shot.png' });
  // normal mit Skript: keine doppelten Gassen
  const p2 = await (await browser.newContext({ viewport: { width: 390, height: 844 }, offline: true })).newPage();
  const errs = []; p2.on('pageerror', e => errs.push(e.message));
  await p2.goto(f);
  console.log('Mit Skript: Gassen', await p2.locator('.g:not(.half)').count(), 'Zwischen', await p2.locator('.g.half').count(), '| Hinweis sichtbar:', await p2.locator('#nojs').isVisible(), '| Export sichtbar:', await p2.locator('#export').isVisible(), '| Fehler', errs);
  await browser.close();
})();
