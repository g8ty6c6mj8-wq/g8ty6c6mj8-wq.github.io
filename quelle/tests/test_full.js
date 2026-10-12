const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + process.cwd() + '/site/index.html');
  const B = {}; const now = Date.now();
  const put = (g, m, ch) => { B['g' + g + '_' + m] = { gasse: g, modell: m, chargen: ch, ts: now }; };
  put(5,'588',['27326']); put(7,'588',['27326']); put(8,'793',['27826']); put(9,'587',['18126']); put(10,'587',['27226']); put(11,'587',['25926']);
  put(13,'854',['27526']); put(14,'855',['27426']); put(15,'588',['26626']); put(16,'854',['27326']); put(17,'587',['27126']); put(18,'855',['27226']); put(19,'588',['26026','25426']);
  put(30,'092',['26126']); put(29,'091',['26026']); put(28,'854',['27926']); put(27.5,'855',['27426']); put(27,'587',['27426']); put(26.5,'587',['27426']);
  put(25.5,'854',['27926']); put(24,'588',['27126']); put(23.5,'854',['27126']); put(22.5,'855',['27226']); put(21.5,'855',['28126']); put(21,'854',['27326']); put(20,'854',['27926']);
  // vollste Gasse: 2 Modelle, eines mit 10 Chargen; Zwischenplatz 3/4 mit 2 Modellen
  put(3,'854',['27101','27102','27103','27104','27105','27106','27107','27108','27109','27110']); put(3,'855',['28001','28002']);
  put(3.5,'091',['11870','11871','11872']); put(3.5,'092',['11902']);
  await page.evaluate(b => { const k = 'gassenplan-offline-v1'; const m = JSON.parse(localStorage.getItem(k)); m.belegung = b; m.stamp = Date.now(); localStorage.setItem(k, JSON.stringify(m)); }, B);
  await page.reload(); await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => {
    const rect = e => e.getBoundingClientRect();
    const aisles = [...document.querySelectorAll('.side > .g')];
    const heights = [...new Set(aisles.map(a => Math.round(rect(a).height)))];
    let clipped = 0, outside = 0, overlap = 0;
    for (const t of document.querySelectorAll('.g .t')) { if (t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1) clipped++; }
    for (const a of aisles) { const st = a.querySelector('.stack'); if (!st || !st.children.length) continue; const A = rect(a), S = rect(st); if (S.top < A.top - 0.5 || S.bottom > A.bottom + 0.5 || S.left < A.left - 0.5 || S.right > A.right + 0.5) outside++; }
    for (const s of document.querySelectorAll('.seam')) { const b = s.firstElementChild; if (b.classList.contains('free')) continue; const Bx = rect(b);
      for (const n of [s.previousElementSibling, s.nextElementSibling]) { const st = n && n.querySelector('.stack'); if (!st || !st.children.length) continue; const S = rect(st); if (S.bottom > Bx.top + 0.5 && S.top < Bx.bottom - 0.5) overlap++; } }
    const chargen = document.querySelectorAll('.g .ch').length;
    return { heights, clipped, outside, overlap, chargenSichtbar: chargen, planHoehe: Math.round(rect(document.getElementById('floor')).height) };
  });
  console.log(JSON.stringify(r), errs);
  console.log(await page.evaluate(() => [...document.querySelectorAll(".g .t")].filter(t => t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1).map(t => [t.textContent, t.scrollWidth, t.clientWidth, t.scrollHeight, t.clientHeight, t.closest(".g").querySelector(".plate").textContent])));
  const box = await page.locator('#floor').boundingBox();
  await page.screenshot({ path: 'full-shot.png', clip: { x: 0, y: box.y, width: 390, height: 900 }, fullPage: true });
  await browser.close();
})();
