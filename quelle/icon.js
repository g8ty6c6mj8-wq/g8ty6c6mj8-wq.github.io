const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const bars = (x) => [0,1,2,3,4,5].map(i => `<rect x="${x}" y="${86 + i*58}" width="132" height="46" rx="6" fill="#1b2129"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <rect width="512" height="512" fill="#f2b705"/>
    ${bars(76)}${bars(304)}
    <rect x="233" y="86" width="8" height="334" fill="#1b2129" opacity=".35"/>
    <rect x="271" y="86" width="8" height="334" fill="#1b2129" opacity=".35"/>
  </svg>`;
  for (const s of [180, 192, 512]) {
    await page.setViewportSize({ width: s, height: s });
    await page.setContent(`<style>html,body{margin:0}</style>` + svg.replace('width="512" height="512"', `width="${s}" height="${s}"`));
    await page.screenshot({ path: `site/icon-${s}.png`, omitBackground: false });
  }
  await browser.close();
})();
