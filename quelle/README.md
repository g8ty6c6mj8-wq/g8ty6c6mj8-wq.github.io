# Gassenplan – Quellen

Die App (`../index.html`) wird aus diesen Dateien gebaut. Sie ist reines HTML, CSS und JavaScript
ohne Bibliotheken; zur Laufzeit gibt es keinen eigenen Server.

| Datei | Inhalt |
|---|---|
| `gassenplan.html` | Vorlage: Plan, Gassen, Zwischenplätze, Suche, Eintragen (auch die Fassung für den Claude-Online-Link) |
| `offline_loader.js` | Speicher auf dem Gerät, Abgleich über GitHub (`gassenplan-daten/daten.json`) |
| `build_offline.py` | baut daraus die App: Schriften eingebettet, Daten-Teil eingesetzt |
| `prerender.js` | zeichnet den Plan vorab in die Datei, damit er beim Öffnen sofort dasteht |
| `seed.json` | Ausgangsstand (Modelle, erste Einträge) |
| `icon.js` | erzeugt die App-Symbole |
| `fonts/` | Schrift Barlow / Barlow Condensed (Jeremy Tran, SIL Open Font License 1.1, https://github.com/jpt/barlow) |
| `tests/` | automatische Tests mit Playwright (Abgleich zweier Handys, gleiche Gassenhöhe) |

## Bauen

Voraussetzungen: Python 3, Node.js, Playwright mit Chromium.

```sh
# App für GitHub Pages (mit Manifest und Service Worker)
python3 build_offline.py stage-pwa.html --pwa
node prerender.js "$PWD/stage-pwa.html" "$PWD/../index.html"
```

Das Bauskript prüft, dass `APP_VERSION`, das Fenster „Was ist neu“ (`WHATS_NEW`) und der oberste Eintrag in `CHANGELOG.md` zusammenpassen, und bricht sonst ab. Die Regeln für jede Änderung stehen in `CLAUDE.md`.

`sw.js` liegt im Hauptordner. Bei Änderungen an den App-Dateien dort die Cache-Version (`CACHE`) erhöhen.
