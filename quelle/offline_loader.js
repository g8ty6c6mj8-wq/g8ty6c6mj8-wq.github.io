  // ---------- Daten (auf diesem Gerät, wahlweise abgeglichen über GitHub) ----------
  const KEY = 'gassenplan-offline-v1';
  let SEED = { stamp: 0, models: {}, belegung: {} };
  try { SEED = JSON.parse($('seed').textContent); } catch (_) {}
  const clone = o => JSON.parse(JSON.stringify(o));
  const fromSeed = () => ({ stamp: SEED.stamp, seedStamp: SEED.stamp, models: clone(SEED.models || {}), belegung: clone(SEED.belegung || {}), deleted: {} });
  // JSON mit sortierten Schlüsseln, um Stände zu vergleichen
  const canon = o => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.keys(v).sort().reduce((r, x) => (r[x] = v[x], r), {}) : v);
  const pick = s => ({ models: (s && s.models) || {}, belegung: (s && s.belegung) || {}, deleted: (s && s.deleted) || {} });
  let persistent = true;
  let mem = null;

  function readStored() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); }
    catch (_) { persistent = false; return null; }
  }
  function saveStore() {
    if (!persistent) return;
    try { localStorage.setItem(KEY, JSON.stringify(mem)); }
    catch (_) { persistent = false; showPersistNotice(); }
  }
  function showPersistNotice() {
    $('notice').textContent = 'Dieses Gerät erlaubt hier kein dauerhaftes Speichern. Speichere vor dem Schließen eine Datei mit dem aktuellen Stand (ganz unten).';
    $('notice').hidden = false;
  }

  const fmt = ms => ms ? new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'unbekannt';
  function renderStand() {
    const n = Object.keys(mem.belegung).length;
    $('stand').textContent = 'Stand: ' + fmt(mem.stamp) + ' · ' + n + (n === 1 ? ' Eintrag' : ' Einträge') + ' in den Gassen';
  }

  const listeners = { models: [], belegung: [] };
  function snap(col) {
    const docs = Object.keys(mem[col]).sort().map(id => {
      const d = mem[col][id];
      return { id, exists: true, data: () => d };
    });
    return { docs, size: docs.length, empty: !docs.length };
  }
  function emit(col) { listeners[col].forEach(fn => fn(snap(col))); }
  // Eigene Änderung: speichern, anzeigen, zum Abgleich vormerken
  function changed(col) {
    mem.stamp = Date.now();
    mem.pending = true;
    mem.rev = (mem.rev || 0) + 1;
    saveStore();
    emit(col);
    renderStand();
    scheduleSync();
  }
  const localDb = {
    collection(col) {
      if (!mem[col]) mem[col] = {};
      return {
        onSnapshot(fn) { listeners[col] = listeners[col] || []; listeners[col].push(fn); fn(snap(col)); return () => {}; },
        doc(id) {
          return {
            async set(d) { mem[col][id] = Object.assign(clone(d), { ts: Date.now() }); changed(col); },
            async update(d) {
              if (!mem[col][id]) throw { code: 'unavailable' };
              mem[col][id] = Object.assign({}, mem[col][id], clone(d), { ts: Date.now() }); changed(col);
            },
            async delete() {
              delete mem[col][id];
              mem.deleted = mem.deleted || {};
              mem.deleted[col + '/' + id] = Date.now();
              changed(col);
            },
          };
        },
      };
    },
  };

  // ---------- Gemeinsamer Speicher: Datei daten.json im privaten GitHub-Projekt ----------
  const REMOTE = { owner: 'g8ty6c6mj8-wq', repo: 'gassenplan-daten', path: 'daten.json' };
  const API = 'https://api.github.com/repos/' + REMOTE.owner + '/' + REMOTE.repo;
  const TKEY = 'gassenplan-token';
  let token = null;
  try { token = localStorage.getItem(TKEY); } catch (_) {}
  const sync = { busy: false, again: false, cache: null, etag: null, last: 0, error: '', authBad: false, timer: null };

  // Zwei Stände zusammenführen: pro Eintrag gewinnt die jüngste Änderung, Löschungen werden mitgeführt
  function mergeStates(a, b) {
    const del = Object.assign({}, (a && a.deleted) || {});
    for (const [k, t] of Object.entries((b && b.deleted) || {})) if (!(del[k] >= t)) del[k] = t;
    const cutoff = Date.now() - 90 * 864e5;
    for (const k in del) if (del[k] < cutoff) delete del[k];
    const out = { models: {}, belegung: {}, deleted: del };
    for (const col of ['models', 'belegung']) {
      const A = (a && a[col]) || {}, B = (b && b[col]) || {};
      for (const id of new Set([...Object.keys(A), ...Object.keys(B)])) {
        const x = A[id], y = B[id];
        const doc = !x ? y : !y ? x : ((y.ts || 0) > (x.ts || 0) ? y : x);
        const dt = del[col + '/' + id];
        if (dt != null && dt >= (doc.ts || 0)) continue;
        out[col][id] = doc;
      }
    }
    return out;
  }
  const isPureSeed = () => canon({ m: mem.models, b: mem.belegung }) === canon({ m: SEED.models || {}, b: SEED.belegung || {} });

  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  async function gh(method, url, body, extra) {
    const headers = Object.assign({
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
    }, extra || {});
    if (body) headers['Content-Type'] = 'application/json';
    let res;
    try { res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' }); }
    catch (_) { throw { userMessage: 'Keine Verbindung zu GitHub. Deine Änderungen sind gespeichert und werden später übertragen.' }; }
    if (res.status === 401) throw { auth: true, userMessage: 'Der Schlüssel ist abgelaufen oder falsch. Bitte einen neuen Schlüssel eingeben.' };
    if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')
      throw { userMessage: 'GitHub bremst gerade wegen zu vieler Abfragen. Es geht in ein paar Minuten weiter.' };
    return res;
  }
  async function fetchRemote() {
    const extra = sync.etag && sync.cache ? { 'If-None-Match': sync.etag } : null;
    const res = await gh('GET', API + '/contents/' + REMOTE.path, null, extra);
    if (res.status === 304) return sync.cache;
    if (res.status === 404) {
      // Datei gibt es noch nicht, oder das Projekt ist mit diesem Schlüssel nicht erreichbar
      const repo = await gh('GET', API);
      if (!repo.ok) throw { auth: true, userMessage: 'Das Projekt „' + REMOTE.repo + '“ wurde nicht gefunden, oder der Schlüssel darf nicht darauf zugreifen.' };
      sync.cache = { data: null, sha: null };
      sync.etag = null;
      return sync.cache;
    }
    if (res.status === 403) throw { auth: true, userMessage: 'Der Schlüssel darf das Projekt nicht lesen. Prüfe die Berechtigung „Contents“.' };
    if (!res.ok) throw { userMessage: 'GitHub antwortet gerade nicht richtig (' + res.status + '). Es wird gleich erneut versucht.' };
    const j = await res.json();
    let data = null;
    try { data = JSON.parse(b64decode(j.content || '')); } catch (_) { data = null; }
    sync.cache = { data, sha: j.sha };
    sync.etag = res.headers.get('ETag');
    return sync.cache;
  }
  async function pushRemote(s, sha) {
    const payload = { version: 1, updated: Date.now(), models: s.models, belegung: s.belegung, deleted: s.deleted };
    const body = { message: 'Gassenplan: Stand aktualisiert', content: b64encode(JSON.stringify(payload, null, 1)) };
    if (sha) body.sha = sha;
    const res = await gh('PUT', API + '/contents/' + REMOTE.path, body);
    if (res.status === 409 || res.status === 422) return false;   // jemand war schneller: neu holen und zusammenführen
    if (res.status === 403 || res.status === 404) throw { auth: true, userMessage: 'Der Schlüssel darf nicht speichern. Prüfe die Berechtigung „Contents: Read and write“.' };
    if (!res.ok) throw { userMessage: 'Speichern bei GitHub hat nicht geklappt (' + res.status + '). Es wird gleich erneut versucht.' };
    const j = await res.json();
    sync.cache = { data: payload, sha: j.content && j.content.sha };
    sync.etag = null;
    return true;
  }
  function applyMerged(m) {
    const before = pick(mem);
    if (canon(before) === canon(m)) return;
    const modelsChanged = canon(before.models) !== canon(m.models);
    mem.models = m.models;
    mem.belegung = m.belegung;
    mem.deleted = m.deleted;
    mem.stamp = Date.now();
    if (modelsChanged) emit('models');
    emit('belegung');
    renderStand();
  }

  async function syncNow() {
    if (!token || !mem || mem.blocked) return;
    if (sync.busy) { sync.again = true; return; }
    sync.busy = true;
    renderSync();
    const rev = mem.rev || 0;
    try {
      let done = false;
      for (let attempt = 0; attempt < 4 && !done; attempt++) {
        const remote = await fetchRemote();
        const base = remote.data ? pick(remote.data) : null;
        // Ein Handy, das nur den Ausgangsstand hat, übernimmt beim ersten Verbinden den gemeinsamen Stand
        const merged = base && !mem.syncedOnce && isPureSeed() ? mergeStates(base, {}) : mergeStates(pick(mem), base || {});
        if (!base || canon(base) !== canon(merged)) {
          if (!(await pushRemote(merged, remote.sha))) continue;
        }
        applyMerged(merged);
        done = true;
      }
      if (!done) throw { userMessage: 'Mehrere Handys speichern gerade gleichzeitig. Es wird gleich erneut versucht.' };
      mem.syncedOnce = true;
      if ((mem.rev || 0) === rev) mem.pending = false;
      saveStore();
      sync.last = Date.now();
      sync.error = '';
      sync.authBad = false;
    } catch (e) {
      sync.error = (e && e.userMessage) || 'Abgleich hat nicht geklappt. Es wird gleich erneut versucht.';
      sync.authBad = !!(e && e.auth);
    }
    sync.busy = false;
    renderSync();
    if (sync.again) { sync.again = false; syncNow(); }
  }
  function scheduleSync() {
    if (!token) return;
    clearTimeout(sync.timer);
    sync.timer = setTimeout(syncNow, 1200);
  }

  const hhmm = ms => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  function renderSync() {
    const on = !!token;
    $('sync-form').hidden = on && !sync.authBad;
    $('sync-now').hidden = !on;
    $('sync-off').hidden = !on;
    const offline = navigator.onLine === false;
    const waiting = mem && mem.pending;
    let long, short, bad = false;
    if (!on) {
      long = 'Nicht verbunden. Jedes Handy hat seinen eigenen Stand.';
    } else if (sync.busy) {
      long = short = 'Wird abgeglichen …';
    } else if (offline) {
      long = 'Kein Internet. ' + (waiting ? 'Deine Änderungen sind gespeichert und werden übertragen, sobald wieder Netz da ist.' : 'Sobald wieder Netz da ist, wird abgeglichen.');
      short = waiting ? 'Kein Internet · Änderungen warten' : 'Kein Internet';
      bad = waiting;
    } else if (sync.error) {
      long = sync.error;
      short = sync.authBad ? 'Gemeinsamer Speicher: Schlüssel prüfen' : 'Abgleich gestört · wird wiederholt';
      bad = true;
    } else if (sync.last) {
      long = 'Verbunden. Alle Handys mit diesem Schlüssel sehen denselben Stand. Zuletzt abgeglichen um ' + hhmm(sync.last) + ' Uhr.';
      short = 'Gemeinsam · abgeglichen ' + hhmm(sync.last);
    } else {
      long = short = 'Verbunden.';
    }
    $('sync-status').textContent = long;
    const line = $('syncline');
    line.hidden = !on;
    line.textContent = short || '';
    line.classList.toggle('bad', bad);
  }

  $('sync-form').addEventListener('submit', async e => {
    e.preventDefault();
    const t = $('sync-token').value.trim();
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]+$/.test(t)) { toast('Das sieht nicht wie ein GitHub-Schlüssel aus. Er beginnt mit github_pat_.'); return; }
    token = t;
    try { localStorage.setItem(TKEY, t); } catch (_) {}
    $('sync-token').value = '';
    $('sync-token').blur();
    sync.cache = null; sync.etag = null; sync.error = ''; sync.authBad = false;
    await syncNow();
    if (sync.authBad) toast('Verbinden hat nicht geklappt. Siehe Hinweis unten.');
    else if (!sync.error) toast('Verbunden. Alle Handys mit diesem Schlüssel sehen jetzt denselben Stand.');
  });
  $('sync-now').addEventListener('click', () => { sync.error = ''; syncNow(); });
  $('sync-off').addEventListener('click', () => {
    token = null;
    try { localStorage.removeItem(TKEY); } catch (_) {}
    sync.error = ''; sync.authBad = false; sync.last = 0;
    renderSync();
    toast('Verbindung getrennt. Die Einträge bleiben auf diesem Handy.');
  });
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 30000);
  window.addEventListener('online', () => syncNow());
  window.addEventListener('offline', renderSync);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });

  function start() {
    mem.deleted = mem.deleted || {};
    mem.blocked = false;
    state.db = localDb;
    state.canWrite = true;
    state.loaded = true;
    renderStand();
    localDb.collection('models').onSnapshot(s => {
      state.models = s.docs.map(d => {
        const v = d.data() || {};
        return { nr: String(v.nr || d.id), pos: typeof v.pos === 'number' ? v.pos : 9999 };
      }).sort((a, b) => a.pos - b.pos || a.nr.localeCompare(b.nr));
      render();
    });
    localDb.collection('belegung').onSnapshot(s => {
      state.placements = s.docs.map(d => {
        const v = d.data() || {};
        return { id: d.id, gasse: Number(v.gasse), modell: String(v.modell || ''), chargen: Array.isArray(v.chargen) ? v.chargen.map(String) : [] };
      }).filter(p => validG(p.gasse) && p.modell);
      render();
    });
    renderSync();
    syncNow();
  }

  // Welcher Stand gilt: der im Gerät gespeicherte oder der aus dieser Datei?
  const stored = readStored();
  if (!persistent) showPersistNotice();
  if (!stored || !stored.models) {
    mem = fromSeed(); saveStore(); start();
  } else if ((SEED.stamp || 0) <= (stored.seedStamp || 0)) {
    mem = stored; start();
  } else if ((stored.stamp || 0) === (stored.seedStamp || 0)) {
    // Gerät hatte keine eigenen Änderungen: neuere Datei still übernehmen
    mem = Object.assign(fromSeed(), { syncedOnce: stored.syncedOnce }); saveStore(); start();
  } else {
    mem = stored;
    mem.blocked = true;   // kein Abgleich, bis entschieden ist
    const box = $('notice');
    box.replaceChildren(
      el('div', {}, 'Diese Datei hat einen neueren Stand (' + fmt(SEED.stamp) + '). Auf diesem Handy gespeichert ist ein Stand vom ' + fmt(stored.stamp) + '. Welchen willst du verwenden?'),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn primary', onclick: () => { mem = fromSeed(); saveStore(); box.hidden = true; start(); } }, 'Stand aus der Datei'),
        el('button', { type: 'button', class: 'btn', onclick: () => { mem.seedStamp = SEED.stamp; saveStore(); box.hidden = true; start(); } }, 'Meinen Stand behalten')));
    box.hidden = false;
    render();
    renderSync();
  }

  $('nojs').hidden = true;
  $('actions').hidden = false;
  $('sync').hidden = false;

  // Gehostete App: offline verfügbar machen, neue Fassung automatisch laden, Hinweis zum Home-Bildschirm in Safari
  if (location.protocol === 'https:' || location.hostname === 'localhost') {
    if ('serviceWorker' in navigator) {
      const hadController = !!navigator.serviceWorker.controller;
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController && !reloaded) { reloaded = true; location.reload(); }
      });
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    const standalone = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    if (!standalone && /iPhone|iPad|iPod/.test(navigator.userAgent)) $('install-hint').hidden = false;
  }

  // ---------- Stand aus einer Datei übernehmen ----------
  function parseShared(text) {
    const m = text.match(/<script type="application\/json" id="seed">([\s\S]*?)<\/script>/);
    const d = JSON.parse(m ? m[1] : text);
    if (!d || typeof d.models !== 'object' || typeof d.belegung !== 'object') throw new Error('format');
    return d;
  }
  $('import-file').addEventListener('change', async () => {
    const inp = $('import-file');
    const f = inp.files && inp.files[0];
    inp.value = '';
    if (!f || !mem) return;
    let d;
    try { d = parseShared(await f.text()); }
    catch (_) { toast('Diese Datei enthält keinen Gassenplan-Stand.'); return; }
    const n = Object.keys(d.belegung).length, own = Object.keys(mem.belegung).length;
    const shared = !!token;
    const box = $('notice');
    box.replaceChildren(
      el('div', {}, 'Datei „' + f.name + '“: Stand vom ' + fmt(d.stamp) + ' mit ' + n + (n === 1 ? ' Eintrag' : ' Einträgen') + '. ' +
        (shared
          ? 'Übernehmen fügt die Einträge der Datei zum gemeinsamen Stand hinzu.'
          : 'Übernehmen ersetzt deinen Stand auf diesem Gerät (' + own + (own === 1 ? ' Eintrag' : ' Einträge') + ').')),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn primary', onclick: () => {
          if (shared) {
            const m = mergeStates(pick(mem), { models: d.models, belegung: d.belegung, deleted: {} });
            mem.models = m.models; mem.belegung = m.belegung;
          } else {
            mem.models = clone(d.models);
            mem.belegung = clone(d.belegung);
          }
          mem.seedStamp = Math.max(mem.seedStamp || 0, SEED.stamp || 0);
          box.hidden = true;
          emit('models');
          changed('belegung');
          toast('Stand übernommen.');
        } }, 'Übernehmen'),
        el('button', { type: 'button', class: 'btn', onclick: () => { box.hidden = true; } }, 'Abbrechen')));
    box.hidden = false;
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  // ---------- Export als neue Datei ----------
  // Ersetzt den Bereich zwischen <!--name--> und <!--/name--> im Quelltext
  function between(html, name, content) {
    const a = '<!--' + name + '-->', b = '<!--/' + name + '-->';
    const i = html.indexOf(a), j = html.indexOf(b);
    return i < 0 || j < i ? html : html.slice(0, i + a.length) + content + html.slice(j);
  }
  // Der Plan als fertiges HTML, damit auch Vorschauen ohne Skript ihn zeigen
  function snapshotHtml() {
    const data = { stamp: mem.stamp, models: mem.models, belegung: mem.belegung };
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    let html = SOURCE.replace(/(<script type="application\/json" id="seed">)[\s\S]*?(<\/script>)/, (_, a, b) => a + json + b);
    const floor = $('floor').cloneNode(true);
    floor.classList.remove('filtering');
    floor.querySelectorAll('[aria-pressed="true"]').forEach(x => x.setAttribute('aria-pressed', 'false'));
    floor.querySelectorAll('.match, .hl').forEach(x => x.classList.remove('match', 'hl'));
    html = between(html, 'plan', floor.outerHTML);
    const chips = el('div', { class: 'chips', id: 'model-chips' }, state.models.map(m => el('span', { class: 'chip' }, m.nr)));
    html = between(html, 'chips', chips.outerHTML);
    html = between(html, 'stand', el('p', { id: 'stand' }, $('stand').textContent).outerHTML);
    return html;
  }
  window.__gassenplanSnapshot = snapshotHtml;

  async function exportFile() {
    if (!mem) return;
    // Dieses Gerät entspricht jetzt genau der exportierten Datei
    mem.seedStamp = mem.stamp;
    saveStore();
    const html = snapshotHtml();
    const d = new Date();
    const pad = x => String(x).padStart(2, '0');
    const name = 'Gassenplan-' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '.html';
    const file = new File([html], name, { type: 'text/html' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Gassenplan' });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    const url = URL.createObjectURL(file);
    const a = el('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Datei ' + name + ' gespeichert.');
  }
  $('export').addEventListener('click', exportFile);
