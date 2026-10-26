const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { spawn } = require('child_process');
(async () => {
  const srv = spawn('npx', ['http-server', 'site', '-p', '8769', '-s', '-c-1'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8769/'); await page.waitForTimeout(2200); if (await page.locator('#news-close').count()) await page.click('#news-close');
  // Admin-Schlüssel festlegen, dann einen 100 Tage alten Protokolleintrag unterschieben
  const v = page.locator('.legend .version'); await v.scrollIntoViewIfNeeded(); for (let i = 0; i < 5; i++) await v.click({ force: true }); await page.waitForTimeout(800);
  await page.fill('#admin-pw', 'geheim123'); await page.fill('#admin-pw2', 'geheim123'); await page.click('#admin-go'); await page.waitForTimeout(2500);
  await page.click('#close-settings'); await page.waitForTimeout(500);
  await page.evaluate(() => { const k = 'gassenplan-offline-v1'; const m = JSON.parse(localStorage.getItem(k)); m.log = [{ id: 'alt1', ts: Date.now() - 100 * 864e5, e: 'x' }]; localStorage.setItem(k, JSON.stringify(m)); });
  await page.reload(); await page.waitForTimeout(2200);
  await page.locator('.rack > .g', { has: page.locator('.plate', { hasText: /^6$/ }) }).click(); await page.waitForTimeout(500);
  await page.getByRole('button', { name: '+ 854' }).click(); await page.waitForTimeout(1500);
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem('gassenplan-offline-v1')).log.map(e => e.id));
  await page.click('#close'); await page.waitForTimeout(400);
  await page.click('#open-settings'); await page.waitForTimeout(600);
  const ds = await page.locator('#datenschutz').innerText();
  await page.locator('#datenschutz').scrollIntoViewIfNeeded();
  await page.locator('#datenschutz').screenshot({ path: 'privacy-shot.png' });
  console.log({ alterEintragEntfernt: !log.includes('alt1'), eintraege: log.length, datenschutzSichtbar: ds.split('\n').length > 3 }, errs);
  await browser.close(); srv.kill();
})();
