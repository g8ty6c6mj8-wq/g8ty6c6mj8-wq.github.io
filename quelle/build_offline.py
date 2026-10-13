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
      <p class="hint" id="install-hint" hidden><b>Als App auf dem Handy:</b> In Safari unten auf „Teilen“ tippen, dann „Zum Home-Bildschirm“. Danach startet der Gassenplan wie eine App, auch ohne Netz.</p>""")
src = must_replace(src, "@media (prefers-reduced-motion: reduce) {",
""".offline, .sync { display: flex; flex-direction: column; gap: 8px; background: var(--surface-2); border-radius: 14px; padding: 12px; }
.offline p, .sync p { margin: 0; }
.offline #stand, .sync #sync-status { font-size: 14px; line-height: 1.45; }
.sync .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.notice .row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }

@media (prefers-reduced-motion: reduce) {""")

# 2b. Markierungen für die fertig gezeichnete Ansicht (Plan steht sofort da, noch bevor das Skript läuft)
src = must_replace(src, '<div class="chips scroll" id="model-chips">', '<!--chips--><div class="chips scroll" id="model-chips">')
chips_end = src.index("</div>", src.index('<!--chips-->')) + len("</div>")
src = src[:chips_end] + "<!--/chips-->" + src[chips_end:]
src = must_replace(src, '  <div class="floor" id="floor">', '  <!--plan--><div class="floor" id="floor">')
src = must_replace(src, '\n\n  <div class="end end-back" id="end-back">', '<!--/plan-->\n\n  <div class="end end-back" id="end-back">')

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
