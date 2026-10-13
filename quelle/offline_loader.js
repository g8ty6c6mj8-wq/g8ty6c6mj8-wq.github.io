  // ---------- Daten (auf diesem Gerät, wahlweise abgeglichen über GitHub) ----------
  const KEY = 'gassenplan-offline-v1';
  let SEED = { stamp: 0, models: {}, belegung: {} };
  try { SEED = JSON.parse($('seed').textContent); } catch (_) {}
  const clone = o => JSON.parse(JSON.stringify(o));
  const fromSeed = () => ({ stamp: SEED.stamp, seedStamp: SEED.stamp, models: clone(SEED.models || {}), belegung: clone(SEED.belegung || {}), deleted: {}, log: [], admin: null });
  // JSON mit sortierten Schlüsseln, um Stände zu vergleichen
  const canon = o => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.keys(v).sort().reduce((r, x) => (r[x] = v[x], r), {}) : v);
  const pick = s => ({ models: (s && s.models) || {}, belegung: (s && s.belegung) || {}, deleted: (s && s.deleted) || {},
    log: (s && s.log) || [], admin: (s && s.admin) || null });
  const LOG_MAX = 1500;
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
    // Verlauf: alle Einträge beider Seiten, nach Zeit sortiert, die neuesten LOG_MAX behalten
    const logMap = new Map();
    for (const e of [...((a && a.log) || []), ...((b && b.log) || [])]) if (e && e.id) logMap.set(e.id, e);
    const log = [...logMap.values()].sort((x, y) => (x.ts - y.ts) || (x.id < y.id ? -1 : 1)).slice(-LOG_MAX);
    // Admin-Schlüssel: der zuletzt festgelegte gilt
    const aa = a && a.admin, ba = b && b.admin;
    const admin = !aa ? (ba || null) : !ba ? aa : ((ba.ts || 0) > (aa.ts || 0) ? ba : aa);
    const out = { models: {}, belegung: {}, deleted: del, log, admin };
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
    const payload = { version: 1, updated: Date.now(), models: s.models, belegung: s.belegung, deleted: s.deleted, log: s.log, admin: s.admin };
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
    mem.log = m.log;
    mem.admin = m.admin;
    if (canon({ a: before.models, b: before.belegung, d: before.deleted }) === canon({ a: m.models, b: m.belegung, d: m.deleted })) { renderAdmin(); return; }
    const modelsChanged = canon(before.models) !== canon(m.models);
    mem.models = m.models;
    mem.belegung = m.belegung;
    mem.deleted = m.deleted;
    mem.stamp = Date.now();
    renderAdmin();
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
      long = 'Wird abgeglichen …'; short = 'Abgleich …';
    } else if (offline) {
      long = 'Kein Internet. ' + (waiting ? 'Deine Änderungen sind gespeichert und werden übertragen, sobald wieder Netz da ist.' : 'Sobald wieder Netz da ist, wird abgeglichen.');
      short = waiting ? 'Offline · wartet' : 'Offline';
      bad = waiting;
    } else if (sync.error) {
      long = sync.error;
      short = sync.authBad ? 'Schlüssel prüfen' : 'Abgleich gestört';
      bad = true;
    } else if (sync.last) {
      long = 'Verbunden. Alle Handys mit diesem Schlüssel sehen denselben Stand. Zuletzt abgeglichen um ' + hhmm(sync.last) + ' Uhr.';
      short = 'Live · ' + hhmm(sync.last);
    } else {
      long = 'Verbunden.'; short = 'Live';
    }
    $('sync-status').textContent = long;
    const line = $('syncline');
    line.hidden = !on;
    line.textContent = short || '';
    line.classList.toggle('bad', bad);
    line.classList.toggle('busy', !!sync.busy);
    line.title = long;
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

  $('sync').hidden = false;

  // ---------- Änderungsverlauf, nur mit Admin-Schlüssel lesbar ----------
  // Jedes Handy verschlüsselt neue Verlaufseinträge mit dem öffentlichen Schlüssel (RSA-OAEP).
  // Den passenden privaten Schlüssel gibt es nur verschlüsselt mit dem Admin-Schlüssel (PBKDF2 + AES-GCM).
  const subtle = window.crypto && window.crypto.subtle;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const ab2b64 = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const b642ab = str => { const s = atob(str); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b.buffer; };
  const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' };
  let pubCache = { jwk: null, key: null };
  let unlocked = null;   // privater Schlüssel, solange der Verlauf geöffnet ist

  async function pubKey() {
    const jwk = mem && mem.admin && mem.admin.pub;
    if (!jwk || !subtle) return null;
    const id = JSON.stringify(jwk);
    if (pubCache.jwk !== id) pubCache = { jwk: id, key: await subtle.importKey('jwk', jwk, RSA, false, ['encrypt']) };
    return pubCache.key;
  }
  async function wrapKey(pw, salt) {
    const base = await subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function sealPrivate(privKey, pw) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const raw = await subtle.exportKey('pkcs8', privKey);
    const data = await subtle.encrypt({ name: 'AES-GCM', iv }, await wrapKey(pw, salt), raw);
    return { salt: ab2b64(salt), iv: ab2b64(iv), data: ab2b64(data) };
  }
  async function openPrivate(pw) {
    const pr = mem.admin.priv;
    const raw = await subtle.decrypt({ name: 'AES-GCM', iv: b642ab(pr.iv) }, await wrapKey(pw, new Uint8Array(b642ab(pr.salt))), b642ab(pr.data));
    return subtle.importKey('pkcs8', raw, RSA, true, ['decrypt']);
  }

  window.__gassenplanLog = async entry => {
    try {
      const key = await pubKey();
      if (!key) return;   // noch kein Admin-Schlüssel festgelegt
      const data = await subtle.encrypt({ name: 'RSA-OAEP' }, key, enc.encode(JSON.stringify(entry)));
      mem.log = (mem.log || []).concat({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), ts: Date.now(), e: ab2b64(data) }).slice(-LOG_MAX);
      mem.pending = true;
      mem.rev = (mem.rev || 0) + 1;
      saveStore();
      scheduleSync();
      if (unlocked) renderAdmin();
    } catch (_) {}
  };

  const where = g => isHalf(g) ? 'mittig auf ' + label(g) : 'in Gasse ' + g;
  function describe(x) {
    const what = x.m === BELEGT ? 'Belegt' : 'Modell ' + x.m;
    switch (x.a) {
      case 'add': return x.m === BELEGT ? 'Als belegt markiert ' + where(x.g) : what + ' ' + where(x.g) + ' gestellt';
      case 'del': return (x.m === BELEGT ? 'Belegt entfernt ' + where(x.g) : what + ' ' + where(x.g) + ' entfernt') + (x.c && x.c.length ? ' (Chargen ' + x.c.join(', ') + ')' : '');
      case 'ch+': return 'Charge ' + x.c + ' eingetragen · ' + what + ' ' + where(x.g);
      case 'ch-': return 'Charge ' + x.c + ' entfernt · ' + what + ' ' + where(x.g);
      case 'model': return 'Modell ' + x.m + ' angelegt';
      default: return 'Änderung';
    }
  }
  const dayFmt = ms => new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  let shownCount = 200;

  async function renderAdmin() {
    if (!$('admin')) return;
    const has = !!(mem && mem.admin && mem.admin.pub);
    $('admin-pw2').hidden = has;
    $('admin-form').hidden = !!unlocked;
    $('admin-view').hidden = !unlocked;
    $('admin-go').textContent = has ? 'Öffnen' : 'Festlegen';
    $('admin-pw').placeholder = has ? 'Admin-Schlüssel' : 'Neuer Admin-Schlüssel';
    $('admin-status').textContent = !has
      ? 'Noch kein Admin-Schlüssel festgelegt. Lege jetzt deinen eigenen fest (mindestens 6 Zeichen). Erst danach wird der Verlauf aufgezeichnet.'
      : unlocked ? 'Geöffnet. ' + (mem.log || []).length + ' Einträge im Verlauf.' : 'Gesperrt. Nur mit dem Admin-Schlüssel einsehbar.';
    if (!unlocked) return;
    const list = $('admin-log');
    const items = (mem.log || []).slice().reverse().slice(0, shownCount);
    const rows = [];
    for (const it of items) {
      let text;
      try { text = describe(JSON.parse(dec.decode(await subtle.decrypt({ name: 'RSA-OAEP' }, unlocked, b642ab(it.e))))); }
      catch (_) { text = 'Eintrag mit einem älteren Schlüssel, nicht lesbar'; }
      rows.push({ ts: it.ts, text });
    }
    list.replaceChildren();
    if (!rows.length) list.append(el('p', { class: 'hint' }, 'Noch keine Änderungen aufgezeichnet.'));
    let day = '';
    for (const r of rows) {
      const d = dayFmt(r.ts);
      if (d !== day) { day = d; list.append(el('div', { class: 'log-day' }, d)); }
      list.append(el('div', { class: 'log-row' }, el('time', {}, hhmm(r.ts)), el('span', {}, r.text)));
    }
    $('admin-more').hidden = (mem.log || []).length <= shownCount;
    const vl = $('admin-versions');
    vl.replaceChildren(...(typeof VERSION_HISTORY !== 'undefined' ? VERSION_HISTORY : []).map(v =>
      el('div', { class: 'log-row' }, el('time', {}, v.d || ''), el('span', {}, el('b', {}, 'Version ' + v.v + ' '), v.t))));
  }

  // Der Bereich ist für Kollegen unsichtbar. Sichtbar wird er auf einem Handy, auf dem der Admin-Schlüssel
  // einmal eingegeben wurde, oder nach fünfmaligem Antippen der kleinen Versionsangabe unter dem Plan.
  const ADMIN_DEVICE = 'gassenplan-admin-geraet';
  const isAdminDevice = () => { try { return localStorage.getItem(ADMIN_DEVICE) === '1'; } catch (_) { return false; } };
  const markAdminDevice = on => { try { on ? localStorage.setItem(ADMIN_DEVICE, '1') : localStorage.removeItem(ADMIN_DEVICE); } catch (_) {} };
  function revealAdmin() {
    $('admin').hidden = false;
    $('open-settings').click();
    setTimeout(() => $('admin').scrollIntoView({ block: 'start', behavior: 'smooth' }), 400);
  }
  if ($('admin') && subtle) {
    $('admin').hidden = !isAdminDevice();
    const ver = document.querySelector('.wrap > .version');
    let taps = [];
    if (ver) ver.addEventListener('click', () => {
      const now = Date.now();
      taps = taps.filter(t => now - t < 3000).concat(now);
      if (taps.length >= 5) { taps = []; revealAdmin(); }
    });
    $('admin-form').addEventListener('submit', async e => {
      e.preventDefault();
      const pw = $('admin-pw').value;
      const has = !!(mem.admin && mem.admin.pub);
      try {
        if (!has) {
          if (pw.length < 6) { toast('Der Admin-Schlüssel braucht mindestens 6 Zeichen.'); return; }
          if (pw !== $('admin-pw2').value) { toast('Die beiden Eingaben stimmen nicht überein.'); return; }
          const pair = await subtle.generateKey({ ...RSA, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt']);
          mem.admin = { pub: await subtle.exportKey('jwk', pair.publicKey), priv: await sealPrivate(pair.privateKey, pw), ts: Date.now() };
          mem.pending = true; mem.rev = (mem.rev || 0) + 1; saveStore(); scheduleSync();
          unlocked = pair.privateKey;
          toast('Admin-Schlüssel festgelegt. Ab jetzt wird der Verlauf aufgezeichnet.');
        } else {
          unlocked = await openPrivate(pw);
        }
        $('admin-pw').value = ''; $('admin-pw2').value = '';
        markAdminDevice(true);
        shownCount = 200;
        renderAdmin();
      } catch (_) {
        unlocked = null;
        toast('Falscher Admin-Schlüssel.');
      }
    });
    $('admin-lock').addEventListener('click', () => { unlocked = null; renderAdmin(); });
    $('admin-hide').addEventListener('click', () => { unlocked = null; markAdminDevice(false); $('admin').hidden = true; renderAdmin(); toast('Auf diesem Handy ausgeblendet.'); });
    $('admin-more').addEventListener('click', () => { shownCount += 300; renderAdmin(); });
    $('admin-change').addEventListener('click', async () => {
      const pw = $('admin-new').value;
      if (pw.length < 6) { toast('Der neue Admin-Schlüssel braucht mindestens 6 Zeichen.'); return; }
      mem.admin = { pub: mem.admin.pub, priv: await sealPrivate(unlocked, pw), ts: Date.now() };
      mem.pending = true; mem.rev = (mem.rev || 0) + 1; saveStore(); scheduleSync();
      $('admin-new').value = '';
      toast('Admin-Schlüssel geändert.');
    });
    // beim Schließen der Einstellungen wieder sperren
    const relock = () => { unlocked = null; setTimeout(() => { if (!isAdminDevice()) $('admin').hidden = true; renderAdmin(); }, 350); };
    $('close-settings').addEventListener('click', relock);
    $('scrim').addEventListener('click', relock);
    renderAdmin();
  }


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

  // ---------- Fertig gezeichnete Fassung (beim Bauen, damit der Plan sofort sichtbar ist) ----------
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
    const chips = el('div', { class: 'chips scroll', id: 'model-chips' }, state.models.map(m => el('span', { class: 'chip' }, m.nr)));
    html = between(html, 'chips', chips.outerHTML);
    html = between(html, 'stand', el('p', { id: 'stand' }, $('stand').textContent).outerHTML);
    return html;
  }
  window.__gassenplanSnapshot = snapshotHtml;
