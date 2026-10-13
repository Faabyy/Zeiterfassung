#!/usr/bin/env bash
# Startet und testet die Zeiterfassung lokal.
#
#   ./dev.sh start   Datenbank, Backend und Frontend starten (Strg+C beendet)
#   ./dev.sh test    Backend- und Frontend-Tests sowie Typprüfung ausführen
#
# Fehlende Einrichtung (.env, Python-Umgebung, node_modules) wird
# automatisch nachgeholt.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

info() {
  echo -e "\033[1;34m==>\033[0m $*"
}

fail() {
  echo -e "\033[1;31mFehler:\033[0m $*" >&2
  exit 1
}

setup_env() {
  if [[ ! -f "$ROOT_DIR/.env" ]]; then
    info '.env fehlt, wird aus .env.example angelegt'
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  fi

  set -a
  # shellcheck source=/dev/null
  source "$ROOT_DIR/.env"
  set +a
}

setup_backend() {
  local venv="$BACKEND_DIR/.venv"
  local marker="$venv/.requirements-installed"

  if [[ ! -x "$venv/bin/python" ]]; then
    info 'Python-Umgebung wird angelegt'
    python3 -m venv "$venv" ||
      fail 'venv konnte nicht angelegt werden. Fehlt python3.12-venv? (sudo apt install python3.12-venv)'
  fi

  # Neu installieren, wenn sich die Requirements seit dem letzten Mal geändert haben.
  if [[ ! -f "$marker" ||
    "$BACKEND_DIR/requirements.txt" -nt "$marker" ||
    "$BACKEND_DIR/requirements-dev.txt" -nt "$marker" ]]; then
    info 'Python-Pakete werden installiert'
    "$venv/bin/pip" install -q -r "$BACKEND_DIR/requirements-dev.txt"
    touch "$marker"
  fi
}

setup_frontend() {
  local marker="$FRONTEND_DIR/node_modules/.package-lock.json"

  if [[ ! -f "$marker" || "$FRONTEND_DIR/package-lock.json" -nt "$marker" ]]; then
    info 'npm-Pakete werden installiert'
    (cd "$FRONTEND_DIR" && npm install --no-audit --no-fund)
  fi
}

start_database() {
  info 'Datenbank wird gestartet'
  docker compose -f "$ROOT_DIR/docker-compose.yml" up -d --wait ||
    fail 'Datenbank konnte nicht gestartet werden. Läuft Docker? (sudo systemctl start docker)'
}

wait_for_backend() {
  local url="http://127.0.0.1:$BACKEND_PORT/api/bookings"

  for _ in $(seq 1 40); do
    if curl -sf -o /dev/null "$url"; then
      return 0
    fi

    sleep 0.25
  done

  fail "Backend antwortet nicht auf $url"
}

command_start() {
  setup_env
  setup_backend
  setup_frontend
  start_database

  info "Backend wird gestartet (http://127.0.0.1:$BACKEND_PORT)"
  (cd "$BACKEND_DIR" && exec .venv/bin/python app.py) &
  local backend_pid=$!

  # Backend auch beenden, wenn das Frontend abstürzt oder Strg+C gedrückt wird.
  trap 'kill "$backend_pid" 2>/dev/null || true; wait "$backend_pid" 2>/dev/null || true' EXIT

  wait_for_backend

  info 'Frontend wird gestartet – im Browser http://localhost:5173 öffnen, Strg+C beendet alles'
  (cd "$FRONTEND_DIR" && npm run dev)
}

command_test() {
  setup_env
  setup_backend
  setup_frontend
  start_database

  info 'Backend-Tests (eigene Testdatenbank, echte Daten bleiben unberührt)'
  (cd "$BACKEND_DIR" && .venv/bin/pytest -q)

  info 'Frontend-Tests'
  (cd "$FRONTEND_DIR" && npm test)

  info 'Frontend: Typprüfung und Build'
  (cd "$FRONTEND_DIR" && npm run build)

  info 'Alle Prüfungen bestanden'
}

case "${1:-}" in
  start) command_start ;;
  test) command_test ;;
  *)
    echo "Aufruf: $0 {start|test}" >&2
    exit 1
    ;;
esac
