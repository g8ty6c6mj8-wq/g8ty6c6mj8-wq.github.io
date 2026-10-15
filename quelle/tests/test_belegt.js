const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + process.cwd() + '/site/index.html');
  const real = JSON.parse(fs.readFileSync('/home/user/gassenplan-daten/daten.json', 'utf8')).belegung;
  await page.evaluate(b => { const k = 'gassenplan-offline-v1'; const m = JSON.parse(localStorage.getItem(k)); m.belegung = b; m.stamp = Date.now(); localStorage.setItem(k, JSON.stringify(m)); }, real);
  await page.reload(); await page.waitForTimeout(2200);
  if (await page.locator('#news-close').count()) await page.click('#news-close');
  const gasse = n => page.locator('.rack > .g', { has: page.locator('.plate', { hasText: new RegExp('^' + n + '$') }) });
  // Gasse 2 als belegt markieren
  await gasse(2).click(); await page.waitForTimeout(500);
  await page.locator('#sheet-body .chip.belegt').click(); await page.waitForTimeout(400);
  const card = await page.locator('#sheet-body .model.belegt').innerText();
  await page.click('#close'); await page.waitForTimeout(400);
  // Zwischenplatz 3/4 belegt
  await page.getByRole('button', { name: /^Zwischen Gasse 3 und 4/ }).click(); await page.waitForTimeout(500);
  await page.locator('#sheet-body .chip.belegt').click(); await page.waitForTimeout(400);
  await page.click('#close'); await page.waitForTimeout(400);
  const g2 = await gasse(2).innerText();
  const seam = await page.getByRole('button', { name: /^Zwischen Gasse 3 und 4/ }).innerText();
  // Filter
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('#model-chips .chip.belegt').click(); await page.waitForTimeout(500);
  const res = await page.locator('#results').innerText();
  await page.screenshot({ path: 'belegt-filter.png' });
  await page.locator('#model-chips .chip.belegt').click(); await page.waitForTimeout(300);
  const box = await page.locator('#floor').boundingBox();
  await page.screenshot({ path: 'belegt-plan.png', clip: { x: 0, y: box.y, width: 390, height: 640 }, fullPage: true });
  // Neustart: bleibt erhalten; Entfernen
  await page.reload(); await page.waitForTimeout(2200);
  const after = await gasse(2).innerText();
  await gasse(2).click(); await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Entfernen', exact: true }).click(); await page.getByRole('button', { name: 'Wirklich entfernen?' }).click(); await page.waitForTimeout(400);
  const toast = await page.locator('#toast').innerText();
  await page.click('#close'); await page.waitForTimeout(400);
  console.log(JSON.stringify({ card, g2, seam, res, after, toast, removed: await gasse(2).innerText(), heights: await page.evaluate(() => [...new Set([...document.querySelectorAll('.rack > .g')].map(a => Math.round(a.getBoundingClientRect().height)))]) }), errs);
  await browser.close();
})();
