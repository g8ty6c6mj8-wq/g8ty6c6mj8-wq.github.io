// Öffnet die gebaute Datei, lässt den Plan zeichnen und speichert ihn fertig gezeichnet ab
const fs = require('fs');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const [inp, out] = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, offline: true })).newPage();
  await page.goto('file://' + inp);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => window.__gassenplanSnapshot);
  fs.writeFileSync(out, await page.evaluate(() => window.__gassenplanSnapshot()));
  await browser.close();
})();
