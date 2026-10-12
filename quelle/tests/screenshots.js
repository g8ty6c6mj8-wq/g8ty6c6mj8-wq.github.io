const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const B = {}; const now = Date.now();
  const put = (g, m, ch) => { B['g' + g + '_' + m] = { gasse: g, modell: m, chargen: ch, ts: now }; };
  const real = JSON.parse(fs.readFileSync('/home/user/gassenplan-daten/daten.json', 'utf8')).belegung;
  for (const k in real) B[k] = real[k];
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto('file://' + process.cwd() + '/site/index.html');
    await page.evaluate(b => { const k = 'gassenplan-offline-v1'; const m = JSON.parse(localStorage.getItem(k)); m.belegung = b; m.stamp = Date.now(); localStorage.setItem(k, JSON.stringify(m)); }, B);
    await page.reload(); await page.waitForTimeout(1600);
    await page.screenshot({ path: `ui-${scheme}-top.png` });
    if (scheme === 'light') {
      await page.evaluate(() => window.scrollTo(0, 700)); await page.waitForTimeout(300);
      await page.screenshot({ path: 'ui-light-mid.png' });
      await page.locator('.rack > .g', { has: page.locator('.plate', { hasText: /^27$/ }) }).click(); await page.waitForTimeout(1500);
      await page.screenshot({ path: 'ui-light-sheet.png' });
      await page.click('#close'); await page.waitForTimeout(500);
      await page.click('#open-settings'); await page.waitForTimeout(600);
      await page.screenshot({ path: 'ui-light-settings.png' });
      await page.click('#close-settings'); await page.waitForTimeout(500);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByRole('button', { name: '855', exact: true }).click(); await page.waitForTimeout(500);
      await page.screenshot({ path: 'ui-light-filter.png' });
    }
    console.log(scheme, errs);
    await ctx.close();
  }
  await browser.close();
})();
