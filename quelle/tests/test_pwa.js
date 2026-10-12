const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const { spawn } = require('child_process');
(async () => {
  const srv = spawn('npx', ['http-server', 'site', '-p', '8765', '-s', '-c-1'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8765/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(800);
  await ctx.setOffline(true);
  await page.reload();
  console.log('Offline neu geladen: Gassen', await page.locator('.g:not(.half)').count(), '| Modelle', await page.locator('#model-chips .chip:not(.add)').count());
  // Eintrag machen und als Datei teilen
  await page.locator('#right .g:not(.half)').nth(2).click();
  await page.getByRole('button', { name: '+ 793' }).click();
  await page.locator('.model', { hasText: '793' }).locator('input').fill('C-777');
  await page.locator('.model', { hasText: '793' }).getByRole('button', { name: 'Eintragen' }).click();
  await page.click('#close');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  const p = process.cwd() + '/shared.html'; await dl.saveAs(p);
  // anderes Gerät: frische App, Datei laden
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage(); p2.on('pageerror', e => errs.push('2: ' + e.message));
  await p2.goto('http://localhost:8765/');
  console.log('Gerät 2 vorher, Gasse 3:', JSON.stringify(await p2.locator('#right .g:not(.half)').nth(2).innerText()));
  await p2.setInputFiles('#import-file', p);
  console.log('Hinweis:', await p2.locator('#notice').innerText());
  await p2.getByRole('button', { name: 'Übernehmen' }).click();
  console.log('Gerät 2 nachher, Gasse 3:', JSON.stringify(await p2.locator('#right .g:not(.half)').nth(2).innerText()));
  await p2.reload();
  console.log('Gerät 2 nach Neustart, Gasse 3:', JSON.stringify(await p2.locator('#right .g:not(.half)').nth(2).innerText()));
  // geteilte Datei in iPhone-Vorschau (ohne Skript)
  const p3 = await (await browser.newContext({ javaScriptEnabled: false })).newPage();
  await p3.goto('file://' + p);
  console.log('Geteilte Datei ohne Skript, Gasse 3:', JSON.stringify(await p3.locator('#right .g:not(.half)').nth(2).innerText()));
  console.log('Fehler:', errs);
  await browser.close(); srv.kill();
})();
