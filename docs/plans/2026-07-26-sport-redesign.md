# Sport-Seite Redesign Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Die bestehende Hantel-Trainingsseite unter `domse.dev/sport/` als glaubwürdiges, täglich nutzbares Krafttrainingsjournal neu bauen und sämtliche KI-/Clip-Art-Übungsbilder durch echte, lizenzierte Fotografie und eine bildunabhängig verständliche Übungsdarstellung ersetzen.

**Architecture:** Die Seite bleibt statisch, frameworkfrei und vollständig clientseitig. `sport/index.html` bildet die semantische Schale, `sport/assets/sport.css` das redaktionelle Journal-Design und `sport/assets/sport.js` einen validierten Store, Timer und Trainingsablauf. Persönliche Trainingsdaten bleiben ausschließlich in `localStorage`; die bisherige Checkbox-Persistenz `domse-sport-done-v1` bleibt lesbar. Bilder dienen nur als redaktionelle Fotografie, nicht als vermeintlich exakte Technik-Anleitung.

**Tech Stack:** HTML5, CSS Custom Properties, Vanilla JavaScript, lokale Assets, Wikimedia Commons/Openverse mit dokumentierter Lizenz, Python-/Node-Validatoren, Playwright.

---

### Task 1: Verträge und Regressionstests festschreiben

**Objective:** Bestehende Progress- und Timerfunktionen sichern und die neue Sicherheits-/Designgrenze testbar machen.

**Files:**
- Create: `sport/tests/sport-contract.test.js`
- Create: `scripts/validate-sport.py`
- Modify: `package.json`

**Steps:**
1. Failing tests für korruptes `domse-sport-done-v1`, bekannte Übungs-IDs, Timer-Drift, Datumsscope und sichere Storage-Fehler schreiben.
2. Static-Gate für CSP, Referrer-Policy, fehlende Inline-Handler, genau ein H1, Skip-Link, lokale Assets, Bilddimensionen und sichtbare Attribution schreiben.
3. Tests rot ausführen.
4. Minimalen Export-/Test-Hook-Vertrag in `sport/assets/sport.js` festlegen.
5. Tests grün ausführen und committen.

### Task 2: Echte Medien kuratieren und alte KI-/Clip-Art-Bilder entfernen

**Objective:** Eine kleine, konsistente Auswahl echter Fotografien mit belastbarer Rechtekette bereitstellen.

**Files:**
- Create: `sport/assets/media/hero-workout.jpg`
- Create: `sport/assets/media/dumbbell-detail.jpg`
- Create: `sport/assets/media/media-manifest.json`
- Remove: `sport/assets/exercises/00-overview.png`
- Remove: `sport/assets/exercises/01-goblet-squat.png` bis `10-reverse-fly.png`

**Steps:**
1. Reale Kameraaufnahmen aus Commons/Openverse suchen; keine Google-Maps-, Social-Media-, KI- oder Suchmaschinenbilder.
2. Originalseite, Creator, Lizenz, Lizenz-URL, Abmessungen und SHA-256 dokumentieren.
3. Bilder visuell auf echte Fotografie, technische Qualität und Motivpassung prüfen.
4. Für die Webauslieferung lokal auf passende JPEG-Größe optimieren, ohne generatives Fill oder Upscaling.
5. Manifest und sichtbare Attribution validieren.

### Task 3: Semantische Sportseite als Trainingsjournal neu bauen

**Objective:** Die bestehende AI-Landingpage-Ästhetik durch eine ruhige, redaktionelle und mobile Trainingsoberfläche ersetzen.

**Files:**
- Rewrite: `sport/index.html`
- Rewrite: `sport/assets/sport.css`

**Steps:**
1. Sichere HTML-Schale mit CSP, Referrer-Policy, Canonical, Skip-Link und genau einem H1 erstellen.
2. Bereiche aufbauen: Training heute, Fortschritt, Block A/B, Timer, Hinweise, Daten/Reset, Bildnachweis.
3. Keine Glassmorphism-Flächen, Blobs, Grain-Overlays, Reveal-Zwang, übergroße Marketingheadline oder Kartenraster verwenden.
4. Mobile-first CSS für 320/360/390/430 px, Landscape, Tablet, Desktop und 200 % Text schreiben.
5. Fokus, Kontrast, 44-px-Ziele, Reduced Motion und Forced Colors berücksichtigen.

### Task 4: Trainingslogik, Timer und sichere Persistenz überarbeiten

**Objective:** Das Training ohne erfundene Zustände zuverlässig nutzbar machen.

**Files:**
- Rewrite: `sport/assets/sport.js`
- Test: `sport/tests/sport-contract.test.js`

**Steps:**
1. Übungskatalog mit zehn Übungen, zwei Blöcken, Sätzen, Gewichten und knappen menschlichen Cues definieren.
2. Legacy-Key `domse-sport-done-v1` streng validieren; unbekannte Schlüssel und Nicht-Booleans verwerfen.
3. Fortschritt datumsspezifisch unter neuem Session-Key speichern, ohne Legacy-Daten zu löschen.
4. Timer auf `performance.now()`/Zeitdifferenz statt Tick-Zählung umstellen; Start/Pause/Reset-Zustände korrekt abbilden.
5. Fortschritt, Sessionabschluss, Reset und Storage-Fehler zugänglich melden.
6. Keine unvalidierten Texte per `innerHTML` rendern.

### Task 5: Browser-Produktgate und visuelle Revision

**Objective:** Alle sichtbaren und interaktiven Funktionen real bedienen und das Design unabhängig prüfen.

**Files:**
- Create: `scripts/sport-product-gate.js`
- Modify: `package.json`

**Steps:**
1. Funktionsinventar definieren: Navigation, Übungschecks, Reload-Persistenz, Timer, Reset, Datenfehler, Medien/Attribution.
2. Matrix für 320, 360, 390, 430, Landscape, Tablet, Desktop und 200-%-Text ausführen.
3. Keine Console-/Page-/Netzwerkfehler, keinen Overflow und mindestens 44-px-Touchziele erzwingen.
4. Screenshots unabhängig auf AI-Design-Tells, Hierarchie, Bildcrop und Mobilreflow reviewen.
5. Einen begrenzten Revisionspass durchführen und alle Gates wiederholen.

### Task 6: Integration, Backup, Deployment und Live-Abnahme

**Objective:** Den geprüften Stand kontrolliert nach `domse.dev/sport/` veröffentlichen.

**Files:**
- Modify only as required by final integration findings.

**Steps:**
1. Spec-, Codequalität-, Security-, Accessibility- und Visual-Reviews auf dem exakten Candidate-SHA ausführen.
2. Produktionsstand und alte Sportassets auf CT108 sichern.
3. Branch nach `main` integrieren und pushen.
4. Offiziellen `domse-dev-deploy.service` verwenden.
5. Live-Funktionsgate und visuelle Matrix gegen `https://domse.dev/sport/` ausführen.
6. Produktive Datei-Hashes, HTTP-Status, CSP, Timer/Storage, Bildpixel, Attribution und Mobile-Reflow prüfen.
7. Rollbackpfad dokumentieren und Deploymenttimer aktiv bestätigen.
