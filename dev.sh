#!/usr/bin/env bash
# Startet und testet die Zeiterfassung lokal.
#
#   ./dev.sh start   Datenbank, Backend und Frontend starten (Strg+C beendet)
#   ./dev.sh demo    Wie start, aber mit eigener Demo-Datenbank voller Testdaten
#   ./dev.sh test   Backend- und Frontend-Tests sowie Typprüfung ausführen
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

  # Neue Einstellungen aus der Vorlage (z. B. APP_USERS) ergänzen, ohne
  # vorhandene Werte zu verändern.
  local line
  while IFS= read -r line; do
    if [[ "$line" =~ ^([A-Z_]+)= ]] &&
      ! grep -q "^${BASH_REMATCH[1]}=" "$ROOT_DIR/.env"; then
      info "${BASH_REMATCH[1]} fehlt in der .env, Wert aus .env.example wird ergänzt"
      echo "$line" >>"$ROOT_DIR/.env"
    fi
  done <"$ROOT_DIR/.env.example"

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

# Das Backend öffnet den Port erst nach Migrationen und Benutzerabgleich;
# jede Antwort (auch 401) heißt also: bereit.
wait_for_backend() {
  local url="http://127.0.0.1:$BACKEND_PORT/api/me"

  for _ in $(seq 1 40); do
    if curl -s -o /dev/null "$url"; then
      return 0
    fi

    sleep 0.25
  done

  fail "Backend antwortet nicht auf $url"
}

# Vor allem anderen prüfen: Sonst würde wait_for_backend das bereits
# laufende Backend finden und demo dessen Datenbank neu anlegen.
ensure_backend_port_free() {
  if curl -s -o /dev/null "http://127.0.0.1:$BACKEND_PORT"; then
    fail "Port $BACKEND_PORT ist belegt. Läuft die App schon in einem anderen Terminal?"
  fi
}

psql_in_container() {
  docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T db \
    psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$@"
}

# Startet das Backend im Hintergrund. Optional läuft danach ein Befehl
# (z. B. Testdaten einspielen), bevor das Frontend im Vordergrund startet.
start_app() {
  info "Backend wird gestartet (http://127.0.0.1:$BACKEND_PORT)"
  (cd "$BACKEND_DIR" && exec .venv/bin/python app.py) &
  local backend_pid=$!

  # Backend auch beenden, wenn das Frontend abstürzt oder Strg+C gedrückt wird.
  # PID direkt einsetzen, die lokale Variable gibt es beim Beenden nicht mehr.
  trap "kill $backend_pid 2>/dev/null || true; wait $backend_pid 2>/dev/null || true" EXIT

  wait_for_backend

  if [[ $# -gt 0 ]]; then
    "$@"
  fi

  info 'Frontend wird gestartet – im Browser http://localhost:5173 öffnen, Strg+C beendet alles'
  (cd "$FRONTEND_DIR" && npm run dev)
}

command_start() {
  setup_env
  ensure_backend_port_free
  setup_backend
  setup_frontend
  start_database
  start_app
}

# Gestempelte Buchungen der letzten 7 Tage für den ersten Benutzer aus
# APP_USERS (heute bleibt leer): Mo–Do mit Pause, Fr ohne gebuchte Pause
# (automatischer Abzug), Sa mit Wochenendzuschlag, So frei. Alle weiteren
# Benutzer starten ohne Buchungen.
seed_demo_data() {
  local first_user="${APP_USERS%%,*}"
  first_user="${first_user%%:*}"

  local other_users
  other_users="$(echo "$APP_USERS" | tr ',' '\n' | tail -n +2 | cut -d: -f1 | paste -sd, -)"

  info "Testdaten werden für $first_user eingespielt"
  psql_in_container -d "$POSTGRES_DB" -v first_user="$first_user" <<'SQL'
INSERT INTO bookings (user_id, type, timestamp, source)
SELECT users.id, plan.type, day + plan.time, 'STAMP'
FROM users
CROSS JOIN generate_series(CURRENT_DATE - 7, CURRENT_DATE - 1, interval '1 day') AS day
JOIN (VALUES
    (1, 4, 'KOMMEN',      time '08:00'),
    (1, 4, 'PAUSE_START', time '12:00'),
    (1, 4, 'PAUSE_ENDE',  time '12:30'),
    (1, 4, 'GEHEN',       time '16:30'),
    (5, 5, 'KOMMEN',      time '08:00'),
    (5, 5, 'GEHEN',       time '15:00'),
    (6, 6, 'KOMMEN',      time '09:00'),
    (6, 6, 'GEHEN',       time '13:00')
) AS plan (first_weekday, last_weekday, type, time)
  ON EXTRACT(ISODOW FROM day) BETWEEN plan.first_weekday AND plan.last_weekday
WHERE users.username = :'first_user';
SQL

  cat <<TEXT

  Demo-Datenbank: Deine echten Buchungen bleiben unberührt.
  Benutzer und Passwörter stehen in der .env unter APP_USERS.
    $first_user: Testdaten der letzten 7 Tage (heute ist noch leer)
    ${other_users:-(keine weiteren Benutzer)}: ohne Buchungen

  Anmeldung:
   1. Mit falschem Passwort anmelden – wird abgelehnt.
   2. Als $first_user anmelden, etwas stempeln, abmelden. Dann als
      anderer Benutzer anmelden: eigene, leere Liste und Historie.
   3. Seite neu laden – man bleibt angemeldet.

  Stempeln und Nachtragen:
   4. Stempeln bucht immer die aktuelle Uhrzeit.
   5. Nachtragen, Art "Pause", an einem Mo–Do, z. B. 14 bis 1415, mit
      Begründung: in der Liste "(nachgetragen)", in der Historie
      "Nachgetragen" mit der Begründung. Ohne Begründung wird abgelehnt.
   6. Nachtragen oder Bearbeiten mit einer Uhrzeit in der Zukunft –
      wird mit "liegt in der Zukunft" abgelehnt.

TEXT
}

command_demo() {
  setup_env
  ensure_backend_port_free
  setup_backend
  setup_frontend
  start_database

  local main_database="$POSTGRES_DB"
  export POSTGRES_DB="${main_database}_demo"

  info "Demo-Datenbank $POSTGRES_DB wird neu angelegt"
  psql_in_container -d "$main_database" \
    -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE)" \
    -c "CREATE DATABASE \"$POSTGRES_DB\""

  # Das Backend spielt beim Start die Migrationen ein, danach die Testdaten.
  start_app seed_demo_data
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
  demo) command_demo ;;
  test) command_test ;;
  *)
    echo "Aufruf: $0 {start|demo|test}" >&2
    exit 1
    ;;
esac
