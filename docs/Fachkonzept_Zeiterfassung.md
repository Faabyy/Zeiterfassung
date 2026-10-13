# Fachkonzept: Zeiterfassung

## 1. Erklärung von Begriffen und Abkürzungen und Definitionen

### 1.1 Änderungshistorie

| Version | Datum | Autor | Änderung |
|---|---|---|---|
| 0.1 | 2026-07-07 | Faabyy | Erstfassung: Anforderungen aufgenommen |
| 0.2 | 2026-07-15 | Faabyy | Fachkonzept automatische Pausenberechnung ergänzt |
| 0.3 | 2026-10-01 | Faabyy | Nach Markdown überführt, Umsetzungsstand nachgezogen, fehlende Kapitel ergänzt |
| 0.4 | 2026-10-01 | Faabyy | Feiertagszuschläge, Änderungshistorie und Bedienoberfläche ergänzt |

### 1.2 Referenzierte Dokumente

- Arbeitszeitgesetz (ArbZG), insbesondere §4 (Ruhepausen) und §5 (Ruhezeit)
- Einkommensteuergesetz (EStG), §3b (Zuschläge für Sonntags-, Feiertags- oder Nachtarbeit)
- Projektanforderungen (Anforderungsliste vom 07.07.2026, siehe `README.md`)

### 1.3 Erläuterung der Begriffe

| Begriff | Erläuterung |
|---|---|
| Buchung / Event | Einzelnes Zeiterfassungsereignis, z. B. Kommen, Gehen, Pause Start, Pause Ende |
| Schicht | Alle Buchungen von "Kommen" bis "Gehen" einschließlich der Pausen |
| Bruttoarbeitszeit | Zeitspanne von "Kommen" bis "Gehen", ohne jeden Abzug |
| Gebuchte Pause | Summe aller Pausen eines Arbeitstages, die mindestens 15 Minuten lang sind |
| Gesetzliche Mindestpause | Nach ArbZG §4 vorgeschriebene Mindestpausenzeit in Abhängigkeit von der Arbeitszeit |
| Automatischer Zusatzabzug | Abzug, falls die gebuchte Pause geringer ist als die gesetzliche Mindestpause |
| Nettoarbeitszeit | Bruttoarbeitszeit minus gebuchte Pause minus automatischer Zusatzabzug |
| Ruhezeit | Zeitspanne zwischen "Gehen" und dem nächsten "Kommen"; gesetzlich mindestens 11 Stunden |
| Stempelsatz | Zuschlagsfaktor auf die Arbeitszeit, abhängig vom Wochentag der Buchung (z. B. Samstag, Sonntag) |
| Korrekturbuchung | Nachträgliche Änderung einer bereits erfassten Buchung |
| Zustand (Status) | Abgeleiteter aktueller Arbeitsstatus einer Person: "OUT" (nicht eingestempelt), "WORKING" (arbeitet), "ON_BREAK" (in Pause) |

### 1.4 Erklärung der Abkürzungen

| Abkürzung | Bedeutung |
|---|---|
| ArbZG | Arbeitszeitgesetz |
| EStG | Einkommensteuergesetz |
| UI | User Interface (Benutzeroberfläche) |
| ISO 8601 | Internationaler Standard für Datums- und Zeitformate |
| DB | Datenbank |
| API | Application Programming Interface |

## 2. Allgemeine Beschreibung

### 2.1 Schutzbedarfseignung

Lernprojekt ohne produktiven Einsatz, es werden nur Testdaten erfasst. Ein besonderer Schutzbedarf besteht nicht.

### 2.2 Eingesetzte Software

| Komponente | Technologie |
|---|---|
| Frontend | React mit TypeScript (Vite) |
| Backend | Python mit FastAPI |
| Datenbank | PostgreSQL, betrieben als Docker-Container |
| Entwicklungsumgebung | Linux (WSL / Ubuntu), Docker, Git/GitHub |

Das Backend speichert die Buchungen und prüft alle Regeln. Das Frontend berechnet daraus Arbeitszeiten, Pausen und Zuschläge.

### 2.3 Organisatorische Einordnung

Persönliches Lernprojekt im Rahmen der Ausbildung. Die Anwendung läuft nur lokal und wird von einer Person genutzt.

## 3. Fachliche Beschreibung

### 3.1 Installation und Konfiguration

Start mit `./dev.sh start` (siehe `README.md`). Die Konfiguration (Datenbankzugang, Ports) steht in der `.env`; eingecheckt ist nur die Vorlage `.env.example`.

### 3.2 Autorisierung

Keine Rollen, alle Funktionen stehen uneingeschränkt zur Verfügung.

### 3.3 Authentifizierung

Keine Anmeldung.

### 3.4 Datensicherung

Code über Git. Die Testdaten werden nicht gesichert.

### 3.5 Datenwiederherstellung

Die Datenbank kann mit `docker compose down -v && docker compose up -d` leer neu aufgesetzt werden.

### 3.6 Betriebsmonitoring

Nicht vorgesehen. Fehler erscheinen in der Ausgabe von Backend und Frontend.

### 3.7 Außerbetriebsetzung

`docker compose down -v` und Löschen des Projektordners.

### 3.8 Kostenmanagement

Keine Kosten, alle Komponenten sind Open Source.

### 3.9 Updatemanagement

Versionen sind in `requirements.txt` und `package-lock.json` festgelegt. Nach Updates `./dev.sh test` ausführen. Änderungen am Datenbankschema erfolgen über neue Dateien in `backend/migrations/`, die das Backend beim Start einspielt.

### 3.10 Fachlogik: Buchungsmodell und Zustandsautomat

Jede Buchung besteht aus einem Buchungstyp und einem einzelnen Zeitstempel im ISO-8601-Format (Datum und Uhrzeit kombiniert, z. B. `2026-07-18T23:45`), damit Zeitspannen auch über einen Tageswechsel hinweg korrekt berechnet werden können.

Buchungstypen:

- KOMMEN
- GEHEN
- PAUSE_START
- PAUSE_ENDE

Zustände (abgeleitet aus der letzten Buchung):

| Zustand | Bedeutung | Erlaubte nächste Buchung |
|---|---|---|
| OUT | Nicht eingestempelt | KOMMEN |
| WORKING | Arbeitet aktuell | PAUSE_START, GEHEN |
| ON_BREAK | Befindet sich in einer Pause | PAUSE_ENDE |

Validierungsregeln:

- Die Buchungen werden in zeitlicher Reihenfolge geprüft. Nachträge zwischen bestehenden Buchungen sind erlaubt, wenn die Reihenfolge danach gültig ist.
- Zwei Buchungen dürfen nicht denselben Zeitpunkt haben.
- Nur die im jeweiligen Zustand erlaubte Buchung darf erfasst werden; alle anderen Versuche werden mit einer Fehlermeldung abgelehnt.
- Mehrere Pausen pro Arbeitstag sind zulässig.
- Ein Arbeitstag ohne jede Pause ist zulässig.
- Nach "Gehen" ist ausschließlich "Kommen" als nächste Buchung erlaubt (auch über einen Tageswechsel hinweg).

Eine Schicht über Mitternacht zählt zum Tag ihres "Kommen".

In der Oberfläche heißen die Buchungstypen "Kommen", "Gehen", "Pause Start" und "Pause Ende".

### 3.11 Fachlogik: Automatische gesetzliche Pausenberechnung

Rechtliche Grundlage: ArbZG §4 – bei einer Arbeitszeit von mehr als 6 bis 9 Stunden sind mindestens 30 Minuten Pause vorgeschrieben, bei mehr als 9 Stunden mindestens 45 Minuten. Pausen zählen nur, wenn sie mindestens 15 Minuten lang sind.

| Arbeitszeit | Gesetzliche Mindestpause |
|---|---|
| bis 6 Stunden | 0 Minuten |
| mehr als 6 bis 9 Stunden | 30 Minuten |
| mehr als 9 Stunden | 45 Minuten |

Ablauf:

1. Bruttoarbeitszeit wird aus allen "Kommen"-"Gehen"-Paaren eines Tages ermittelt.
2. Gebuchte Pause wird aus der Summe aller "Pause Start"-"Pause Ende"-Paare ermittelt. Pausen unter 15 Minuten zählen als Arbeitszeit.
3. Die gesetzliche Mindestpause wird anhand der Arbeitszeit (Bruttoarbeitszeit minus gebuchte Pause) bestimmt.
4. Ist die gebuchte Pause zu gering, wird die Differenz automatisch abgezogen, aber nur so weit, dass die Nettoarbeitszeit nicht unter 6 bzw. 9 Stunden fällt.
5. Die Nettoarbeitszeit ergibt sich aus: Bruttoarbeitszeit − gebuchte Pause − automatischer Zusatzabzug.

Beispiel: 6:10 Stunden ohne Pause ergeben 6:00 Stunden netto (10 Minuten Abzug), nicht 5:40 Stunden.

Der automatische Zusatzabzug wird nur als Information angezeigt, nicht als Fehler.

Wird länger als 6 Stunden am Stück ohne Pause gearbeitet (ArbZG §4), erscheint ein Hinweis. Pausen unter 15 Minuten unterbrechen dabei nicht.

### 3.12 Fachlogik: Wochenend- und Feiertagszuschläge (Stempelsätze)

| Zeitraum | Zuschlag |
|---|---|
| Samstag | 25 % |
| Sonntag | 50 % |
| Bundesweite Feiertage, 31.12. ab 14 Uhr | 125 % |
| 1. Mai, 25. und 26.12., 24.12. ab 14 Uhr | 150 % |

Die Feiertagssätze entsprechen den steuerfreien Höchstsätzen nach §3b EStG. Fällt ein Feiertag auf ein Wochenende, gilt nur der höhere Satz.

Der Zuschlag gilt für die Nettoarbeitszeit und wird pro Minute berechnet: Eine Schicht von Samstag 22:00 bis Sonntag 04:00 Uhr ergibt 2 Stunden mit 25 % und 4 Stunden mit 50 %. Der Zuschlag wird als Zeit (Minuten) ausgewiesen.

### 3.13 Fachlogik: Mindestruhezeit zwischen Arbeitstagen

Zwischen "Gehen" und dem nächsten "Kommen" müssen mindestens 11 Stunden liegen, gemäß ArbZG §5. Ein "Kommen", das diese Regel verletzt, wird mit Fehlermeldung abgelehnt.

### 3.14 Fachlogik: Korrekturmöglichkeiten

- Bearbeiten: Typ und Zeitpunkt einer Buchung ändern.
- Zeitraum nachtragen: Pause oder Arbeitszeit mit Datum, Beginn und Ende auf einmal erfassen, z. B. eine vergessene Pause. Liegt das Ende vor dem Beginn, endet der Zeitraum am Folgetag.
- Löschen: Damit keine halben Schichten oder Pausen übrig bleiben, wird beim Löschen von "Kommen" oder "Gehen" die ganze Schicht gelöscht, beim Löschen einer Pausenbuchung die ganze Pause. Vorher erscheint eine Bestätigung.

Auch Korrekturen werden nach den Regeln aus 3.10 und 3.13 geprüft.

Jede Anlage, Korrektur und Löschung wird mit altem und neuem Wert protokolliert. Abgelehnte Änderungen werden nicht protokolliert. Die Historie kann nach Rückfrage geleert werden; die Buchungen bleiben dabei erhalten.

### 3.15 Bedienoberfläche

| Bereich | Inhalt |
|---|---|
| Neue Buchung | Stempeln nach dem Stempeluhr-Prinzip: Ein Klick auf Kommen, Pause Start, Pause Ende oder Gehen bucht mit der aktuellen Uhrzeit. Angeboten werden nur die im aktuellen Zustand erlaubten Buchungen. Für Nachträge kann eine andere Zeit eingegeben werden, außerdem lassen sich ganze Zeiträume nachtragen (3.14). |
| Heutige Buchungen | Buchungen des heutigen Arbeitstages mit Bearbeiten und Löschen. Ein Klick auf einen Tag in der Tagesübersicht zeigt stattdessen dessen Buchungen. |
| Tagesübersicht | Status, Netto- und Zuschlagssumme sowie eine Tabelle mit Brutto, Pause, Pausenabzug, Netto und Zuschlägen je Arbeitstag. Hinweise zu Pausen erscheinen darunter. |
| Änderungshistorie | Alle Anlagen, Korrekturen und Löschungen, neueste zuerst. |

Datum und Uhrzeit werden ohne Kalender eingegeben: Das Datum wird aus den letzten 31 Tagen ausgewählt, die Uhrzeit frei eingetippt (z. B. `8`, `830` oder `8:30` für 08:30 Uhr).

### 3.16 Fehlerbehandlung

Ungültige Buchungen werden abgelehnt und nicht gespeichert. Die Fehlermeldung erklärt den Grund, z. B. "Die gesetzliche Mindestruhezeit von 11 Stunden wurde nicht eingehalten. Seit dem letzten „Gehen“ sind erst 8:30 Std. vergangen."

### 3.17 Datenmodell

Tabelle `bookings`:

| Spalte | Bedeutung |
|---|---|
| `id` | Fortlaufende Nummer |
| `type` | Buchungstyp |
| `timestamp` | Zeitpunkt der Buchung (eindeutig) |
| `created_at`, `updated_at` | Zeitpunkt der Anlage und der letzten Änderung |

Tabelle `booking_changes` (Änderungshistorie):

| Spalte | Bedeutung |
|---|---|
| `booking_id` | Betroffene Buchung |
| `action` | Art der Änderung: CREATE, UPDATE oder DELETE |
| `old_type`, `old_timestamp` | Werte vor der Änderung |
| `new_type`, `new_timestamp` | Werte nach der Änderung |
| `changed_at` | Zeitpunkt der Änderung |

Arbeitszeiten und Zuschläge werden nicht gespeichert, sondern bei jeder Anzeige berechnet.

## 4. Sicherheitsmaßnahmen

Da es sich um ein Lernprojekt ohne echte Daten handelt, werden keine besonderen Sicherheitsmaßnahmen umgesetzt.

### 4.1 Verschlüsselung Transportweg

Keine.

### 4.2 Verschlüsselung ruhender Daten

Keine.

### 4.3 Auditierung

Keine, abgesehen von der fachlichen Änderungshistorie (3.14).

### 4.4 Autorisierung

Siehe 3.2.

### 4.5 Authentifizierung

Siehe 3.3.

### 4.6 Firewall Regeln

Alle Dienste sind nur lokal (`127.0.0.1`) erreichbar, Freigaben sind nicht nötig.

## 5. Offene Punkte

Keine.
