"""Baut aus der Vorlage die App für GitHub Pages (Schriften eingebettet, Daten auf dem Gerät, Abgleich über GitHub).

python3 build_offline.py OUT.html --pwa
--pwa fügt Manifest, Home-Bildschirm-Angaben und den Service Worker hinzu.
"""
import base64, json, pathlib, sys, time

APP_URL = "https://g8ty6c6mj8-wq.github.io/"

here = pathlib.Path(__file__).parent
src = (here / "gassenplan.html").read_text()
seed = json.loads((here / "seed.json").read_text())
seed.setdefault("stamp", int(time.time() * 1000))
out = pathlib.Path(sys.argv[1])
pwa = "--pwa" in sys.argv

# Prüfung: jede neue Version braucht ein passendes Fenster „Was ist neu“ und einen Eintrag im CHANGELOG
import re as _re
_ver = _re.search(r"const APP_VERSION = '([^']+)'", src).group(1)
_news = _re.search(r"const WHATS_NEW = \{\s*version: '([^']+)', from: '([^']+)'", src)
assert _news, "WHATS_NEW fehlt in gassenplan.html"
assert _news.group(1) == _ver, f"WHATS_NEW ist noch für Version {_news.group(1)}, die App ist aber {_ver}: Texte für die neue Version eintragen"
assert _news.group(2) != _ver, "WHATS_NEW.from muss die vorherige Version sein"
for _cl in (here.parent / "CHANGELOG.md", here / "CHANGELOG.md"):
    if _cl.exists():
        _top = _re.search(r"^## (\S+)", _cl.read_text(), _re.M).group(1)
        assert _top == _ver, f"CHANGELOG.md beginnt mit {_top}, die App ist aber {_ver}"
        break

def must_replace(s, old, new):
    assert s.count(old) == 1, ("nicht eindeutig", old[:60])
    return s.replace(old, new)

# 1. Schriften einbetten statt Google Fonts
faces = [("Barlow", 400, "barlow-400"), ("Barlow", 500, "barlow-500"), ("Barlow", 600, "barlow-600"),
         ("Barlow Condensed", 600, "bc-600"), ("Barlow Condensed", 700, "bc-700")]
ff = "".join(
    "@font-face{font-family:'%s';font-style:normal;font-weight:%d;font-display:swap;"
    "src:url(data:font/woff2;base64,%s) format('woff2');}\n"
    % (fam, w, base64.b64encode((here / "fonts" / f"{f}.woff2").read_bytes()).decode())
    for fam, w, f in faces)
link_start = src.index('<link rel="preconnect"')
link_end = src.index("<style>")
src = src[:link_start] + "<style>\n" + ff + "</style>\n" + src[link_end:]

# 2. Stand und gemeinsamer Speicher im Fenster „Einstellungen und Hilfe“
src = must_replace(src, "<!--settings-->",
"""<section class="offline">
        <div class="label">Stand</div>
        <!--stand--><p id="stand">Stand wird geladen …</p><!--/stand-->
      </section>
      <section class="sync" id="sync" hidden>
        <div class="label">Gemeinsamer Speicher</div>
        <p id="sync-status">Nicht verbunden. Jedes Handy hat seinen eigenen Stand.</p>
        <form class="addrow" id="sync-form">
          <input id="sync-token" type="password" placeholder="Schlüssel github_pat_…" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="GitHub-Schlüssel">
          <button class="btn primary" type="submit">Verbinden</button>
        </form>
        <div class="row">
          <button class="btn" id="sync-now" type="button" hidden>Jetzt abgleichen</button>
          <button class="linkbtn" id="sync-off" type="button" hidden>Verbindung trennen</button>
        </div>
        <p class="hint">Ohne gemeinsamen Speicher bleiben die Einträge nur auf diesem Handy.</p>
      </section>
      <section class="admin" id="admin" hidden>
        <div class="label">Änderungsverlauf · nur Admin</div>
        <p id="admin-status">Gesperrt.</p>
        <form class="admin-form" id="admin-form">
          <input id="admin-pw" type="password" placeholder="Admin-Schlüssel" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Admin-Schlüssel">
          <input id="admin-pw2" type="password" placeholder="Schlüssel wiederholen" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Admin-Schlüssel wiederholen" hidden>
          <button class="btn primary" type="submit" id="admin-go">Öffnen</button>
        </form>
        <div id="admin-view" hidden>
          <div class="log" id="admin-log"></div>
          <button class="btn" id="admin-more" type="button" hidden>Ältere anzeigen</button>
          <div class="label" style="margin-top: 6px;">App-Versionen</div>
          <div class="log" id="admin-versions"></div>
          <details class="admin-change">
            <summary>Admin-Schlüssel ändern</summary>
            <div class="addrow"><input id="admin-new" type="password" placeholder="Neuer Schlüssel" autocomplete="off" aria-label="Neuer Admin-Schlüssel"><button class="btn" type="button" id="admin-change">Ändern</button></div>
          </details>
          <button class="linkbtn" id="admin-lock" type="button">Verlauf sperren</button>
        </div>
      </section>
      <p class="hint" id="install-hint" hidden><b>Als App auf dem Handy:</b> In Safari unten auf „Teilen“ tippen, dann „Zum Home-Bildschirm“. Danach startet der Gassenplan wie eine App, auch ohne Netz.</p>""")
src = must_replace(src, "@media (prefers-reduced-motion: reduce) {",
""".offline, .sync { display: flex; flex-direction: column; gap: 8px; background: var(--surface-2); border-radius: 14px; padding: 12px; }
.offline p, .sync p { margin: 0; }
.offline #stand, .sync #sync-status { font-size: 14px; line-height: 1.45; }
.sync .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.notice .row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.admin { display: flex; flex-direction: column; gap: 8px; background: var(--surface-2); border-radius: 14px; padding: 12px; }
.admin p { margin: 0; font-size: 14px; line-height: 1.45; }
.admin-form { display: flex; flex-direction: column; gap: 6px; }
.admin-form input, .admin-change input { height: 42px; padding-inline: 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); font-size: 16px; min-width: 0; }
.admin-form input:focus, .admin-change input:focus { outline: none; border-color: var(--mark); box-shadow: 0 0 0 3px color-mix(in srgb, var(--mark) 30%, transparent); }
#admin-view { display: flex; flex-direction: column; gap: 8px; }
#admin-view[hidden] { display: none; }
.log { display: flex; flex-direction: column; background: var(--surface); border-radius: 10px; border: 1px solid var(--line); max-height: 46vh; overflow-y: auto; }
.log-day { position: sticky; top: 0; background: var(--surface-2); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); padding: 6px 10px; border-bottom: 1px solid var(--line); }
.log-row { display: grid; grid-template-columns: 44px 1fr; gap: 8px; padding: 7px 10px; border-bottom: 1px solid var(--line); font-size: 14px; line-height: 1.35; }
.log-row:last-child { border-bottom: 0; }
.log-row time { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 13px; }
#admin-versions .log-row { grid-template-columns: 84px 1fr; }
.admin-change summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--muted); padding: 4px 0; }
.admin-change .addrow { margin-top: 6px; }

@media (prefers-reduced-motion: reduce) {""")

# 2b. Markierungen für die fertig gezeichnete Ansicht (Plan steht sofort da, noch bevor das Skript läuft)
src = must_replace(src, '<div class="chips scroll" id="model-chips">', '<!--chips--><div class="chips scroll" id="model-chips">')
chips_end = src.index("</div>", src.index('<!--chips-->')) + len("</div>")
src = src[:chips_end] + "<!--/chips-->" + src[chips_end:]
src = must_replace(src, '  <div class="floor" id="floor">', '  <!--plan--><div class="floor" id="floor">')
src = must_replace(src, '\n\n  <div class="end end-back" id="end-back">', '<!--/plan-->\n\n  <div class="end end-back" id="end-back">')

# 2c. App-Versionen mit Datum aus CHANGELOG.md
_hist = []
for _cl in (here.parent / "CHANGELOG.md", here / "CHANGELOG.md"):
    if _cl.exists():
        for _m in _re.finditer(r"^## (\S+) · \S+ · (\d\d\.\d\d\.\d{4})[^\n]*\n((?:- [^\n]*\n(?:  [^\n]*\n)*)*)", _cl.read_text(), _re.M):
            _first = _re.sub(r"\s+", " ", _m.group(3).split("\n- ")[0].lstrip("- ")).strip()
            _hist.append({"v": _m.group(1), "d": _m.group(2), "t": _first})
        break
src = must_replace(src, "/*VERSION_HISTORY*/[]", json.dumps(_hist, ensure_ascii=False))

# 3. Quelltext vor dem ersten Rendern festhalten (für den Export)
src = must_replace(src, "(() => {\n  // Version:",
"(() => {\n  const SOURCE = '<!doctype html>\\n' + document.documentElement.outerHTML;\n  // Version:")

# 4. Datenschicht: lokaler Speicher statt db-Capability
start = src.index("  // ---------- Daten laden ----------")
end = src.index("})();\n</script>", start)
src = src[:start] + (here / "offline_loader.js").read_text() + src[end:]

# 5. Eingebetteter Stand + vollständiges Dokument
seed_json = json.dumps(seed, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
head = ('<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<meta name="theme-color" content="#f2b705">\n')
if pwa:
    head += ('<link rel="manifest" href="manifest.webmanifest">\n'
             '<link rel="apple-touch-icon" href="icon-180.png">\n'
             '<link rel="icon" type="image/png" href="icon-192.png">\n'
             '<meta name="apple-mobile-web-app-capable" content="yes">\n'
             '<meta name="mobile-web-app-capable" content="yes">\n'
             '<meta name="apple-mobile-web-app-title" content="Gassenplan">\n'
             '<meta name="apple-mobile-web-app-status-bar-style" content="default">\n')
head += ('<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
         'body{margin:0;font:14px/1.4 system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>\n')
body_start = src.index('<div class="wrap">')
doc = (head + src[:body_start] +
       '<script type="application/json" id="seed">' + seed_json + "</script>\n" +
       "</head>\n<body>\n" + src[body_start:] + "\n</body>\n</html>\n")
out.write_text(doc)
print(out, len(doc))
