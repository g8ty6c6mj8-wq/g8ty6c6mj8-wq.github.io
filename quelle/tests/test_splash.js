const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + process.cwd() + '/site/index.html');
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'splash-shot.png' });
  const during = await page.evaluate(() => !!document.getElementById('splash') && getComputedStyle(document.getElementById('splash')).opacity);
  await page.waitForTimeout(1600);
  const after = await page.evaluate(() => !!document.getElementById('splash'));
  const labels = await page.evaluate(() => [...document.querySelectorAll('.app-version')].map(e => e.textContent));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.screenshot({ path: 'version-shot.png' });
  console.log({ during, after, labels }, errs);
  await browser.close();
})();
