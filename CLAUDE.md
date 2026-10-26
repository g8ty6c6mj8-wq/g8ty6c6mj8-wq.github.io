# Gassenplan – Regeln für jede Änderung

Gilt für alle Änderungen, die auf die Handys gehen. Sprache in App und Texten: Deutsch.

1. **Sicherung zuerst:** Vom aktuellen `main` einen Zweig `backup-<aktuelle Version>` anlegen und pushen
   (z. B. `backup-2.3`), bevor die neue Version hochgeladen wird.
2. **Version erhöhen** (Zählweise wie bei Jarvis): `APP_VERSION` in `quelle/gassenplan.html`, immer mit
   zwei Nachkommastellen. Jede Änderung zählt um 0,01 weiter (3.00 → 3.01 → 3.02 …), große Umbauten
   springen auf die nächste ganze Zahl (z. B. 4.00). Die Stufe (`Alpha`) ändert nur Kadir Atak.
3. **Fenster „Was ist neu“:** `WHATS_NEW` in `quelle/gassenplan.html` anpassen:
   `version` = neue Version, `from` = vorherige Version, 2–4 kurze Punkte für die Kollegen,
   verständlich und ohne Technik. Das Fenster sperrt die App, bis man es gelesen hat: Der Knopf
   „Gelesen und verstanden“ wird erst nach einigen Sekunden und nach dem Blättern bis zum Ende frei.
   Soll ein Update nicht bekannt gegeben werden (nur auf Kadirs Wunsch): `silent: true`, `items: []`,
   und im CHANGELOG nur neutral „Interne Verbesserungen“ schreiben.
4. **CHANGELOG.md** oben um die neue Version ergänzen.
5. **Bauen und prüfen** (siehe `quelle/README.md`): Das Bauskript bricht ab, wenn Version,
   „Was ist neu“ und CHANGELOG nicht zusammenpassen. Tests in `quelle/tests/` laufen lassen,
   in `sw.js` die `CACHE`-Nummer erhöhen, dann pushen. Offene Apps holen die neue Fassung von selbst
   (beim Zurückkehren in die App und alle 5 Minuten) und starten neu, sobald niemand gerade etwas einträgt.

Räume: 1 Knorr-Ansicht (dieser Plan), 2 Versand Mechanik, 3 Versand Fort-Knox (beide in Bearbeitung,
eigene Modelle und Regeln folgen).

Nicht ändern ohne Rückfrage: Zählung der Gassen (rechts 1–19 von vorne nach hinten, links 20–31 zurück),
Eingang bei 19/20, gleiche Dicke aller Gassen, Modelle und Chargen nie abschneiden.
