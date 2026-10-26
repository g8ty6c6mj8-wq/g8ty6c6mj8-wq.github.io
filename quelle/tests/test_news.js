// Fenster „Was ist neu“: bei normaler Version bis zum Schließen, bei silent gar nicht
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
(async () => {
  const silent = /silent: true,/.test(fs.readFileSync('site/index.html', 'utf8'));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const vis = async () => (await page.locator('#news').count()) > 0;
  await page.goto('file://' + process.cwd() + '/site/index.html'); await page.waitForTimeout(1900);
  const r = { silent, erstesOeffnen: await vis() };
  if (!silent) {
    await page.reload(); await page.waitForTimeout(1900); r.zweitesOeffnen = await vis();
    await page.click('#news-close'); await page.reload(); await page.waitForTimeout(1900); r.nachX = await vis();
  }
  r.ok = silent ? !r.erstesOeffnen : (r.erstesOeffnen && r.zweitesOeffnen && !r.nachX);
  console.log(r, errs);
  await browser.close();
})();
