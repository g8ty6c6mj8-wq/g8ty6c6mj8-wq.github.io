const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const vis = async () => (await page.locator('#news').count()) > 0;
  await page.goto('file://' + process.cwd() + '/site/index.html');
  const before = await vis(); await page.waitForTimeout(1900);
  const r = { vorStartbildEnde: before, erstesOeffnen: await vis() };
  await page.screenshot({ path: 'news-shot.png' });
  // Hintergrund antippen schließt nicht
  await page.mouse.click(20, 20); await page.waitForTimeout(300); r.nachTippDaneben = await vis();
  await page.reload(); await page.waitForTimeout(1900); r.zweitesOeffnen = await vis();
  await page.click('#news-close'); await page.waitForTimeout(300); r.nachX = await vis();
  await page.reload(); await page.waitForTimeout(1900); r.nachXneuGeoeffnet = await vis();
  await page.evaluate(() => localStorage.setItem('gassenplan-neu-gelesen', '2.2'));
  await page.reload(); await page.waitForTimeout(1900); r.naechsteVersion = await vis();
  console.log(r, errs);
  await browser.close();
})();
