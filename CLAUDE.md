# Gassenplan – Regeln für jede Änderung

Gilt für alle Änderungen, die auf die Handys gehen. Sprache in App und Texten: Deutsch.

1. **Sicherung zuerst:** Vom aktuellen `main` einen Zweig `backup-<aktuelle Version>` anlegen und pushen
   (z. B. `backup-2.3`), bevor die neue Version hochgeladen wird.
2. **Version erhöhen:** `APP_VERSION` in `quelle/gassenplan.html`. Kleine Änderungen 2.3 → 2.4,
   große Umbauten → 3.0. Die Stufe (`Alpha`) ändert nur Kadir Atak.
3. **Fenster „Was ist neu“:** `WHATS_NEW` in `quelle/gassenplan.html` anpassen:
   `version` = neue Version, `from` = vorherige Version, 2–4 kurze Punkte für die Kollegen,
   verständlich und ohne Technik. Das Fenster erscheint bei jedem Öffnen, bis man es schließt.
   Soll ein Update nicht bekannt gegeben werden (nur auf Kadirs Wunsch): `silent: true`, `items: []`,
   und im CHANGELOG nur neutral „Interne Verbesserungen“ schreiben.
4. **CHANGELOG.md** oben um die neue Version ergänzen.
5. **Bauen und prüfen** (siehe `quelle/README.md`): Das Bauskript bricht ab, wenn Version,
   „Was ist neu“ und CHANGELOG nicht zusammenpassen. Tests in `quelle/tests/` laufen lassen,
   in `sw.js` die `CACHE`-Nummer erhöhen, dann pushen.

Nicht ändern ohne Rückfrage: Zählung der Gassen (rechts 1–19 von vorne nach hinten, links 20–31 zurück),
Eingang bei 19/20, gleiche Dicke aller Gassen, Modelle und Chargen nie abschneiden.
