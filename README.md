# Zeiterfassung als Webapplikation

## Anforderungen
- Entwicklung einer Zeiterfassung als Webapplikation
- Backendsprache frei wählbar
- Frontend: React
- Postgres-DB als Docker-Container
- Berechnung von Zeiten und Stempelsätzen
- Korrekturmöglichkeiten
- Fehlerbehandlung bei Falschbuchungen
- Automatische Zuschläge für Wochenendbuchungen (Samstag 25 %, Sonntag 50 %)
- Zwischen dem Gehen des Vortags und dem Kommen des Folgetags muss die gesetzliche Mindestruhezeit von 11 Stunden eingehalten werden
- Automatische Berechnung der gesetzlichen Pausenzeiten, auch ohne Buchung einer Pause

### Zusätzlich
- [x] Die Netto Buchungszeiten und die Zuschläge sollen an einer Stelle zusammengerechnet dargestellt werden.
- [x] Stempeln und Nachtragen trennen: Stempeln bucht nur "jetzt" (Zeitpunkt vom Server, keine frei wählbare Zeit), Nachtragen ist ein eigener Weg mit Zeitangabe
- [x] Fix: Stempeln in der Zukunft verhindern (gilt auch für Nachtragen)
- [x] Fix: Stempeln in der Vergangenheit verhindern, Vergangenheit nur über Nachtragen
- [x] Änderungshistorie: Buchungen als Nachtragung kennzeichnen
- [x] Login-Funktion ohne Registrierung

Details: [Fachkonzept](docs/Fachkonzept_Zeiterfassung.md)

## Aufbau
- `frontend/`: React mit TypeScript (Vite)
- `backend/`: Python mit FastAPI, prüft alle Buchungen
- Datenbank: PostgreSQL im Docker-Container, Zugangsdaten in der `.env`

## Starten
Voraussetzungen: Docker, Node.js und `python3.12-venv`.

```bash
./dev.sh start
```
Danach `http://localhost:5173` öffnen und mit einem Benutzer aus `APP_USERS` in der `.env` anmelden. `Strg+C` beendet alles. Für die Landesfeiertage das Bundesland unter `APP_FEDERAL_STATE` eintragen (z. B. `BY`).

Zum Ausprobieren startet `./dev.sh demo` die App mit einer eigenen Demo-Datenbank voller Testdaten und zeigt, wie sich die neuesten Änderungen prüfen lassen.

---

Co-Authored-By: Claude
