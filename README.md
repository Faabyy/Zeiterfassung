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
Danach `http://localhost:5173` öffnen. `Strg+C` beendet alles.
Beim ersten Start legt das Skript die `.env` an und installiert die Pakete.

## Testen
```bash
./dev.sh test
```

---

Co-Authored-By: Claude
