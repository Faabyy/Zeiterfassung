"""Spielt die SQL-Migrationen aus backend/migrations/ der Reihe nach ein.

Jede Datei NNN_beschreibung.sql läuft genau einmal; welche schon gelaufen
sind, steht in der Tabelle schema_migrations. Bereits eingespielte Dateien
nicht mehr ändern, sondern eine neue Migration anlegen.
"""

from pathlib import Path

import psycopg

MIGRATIONS_DIR = Path(__file__).resolve().parent / 'migrations'


def migrate(connection: psycopg.Connection) -> list[str]:
    with connection.transaction():
        # Verhindert, dass zwei Prozesse gleichzeitig migrieren
        # (z. B. Backend und Tests).
        connection.execute("SELECT pg_advisory_xact_lock(hashtext('schema_migrations'))")
        connection.execute(
            'CREATE TABLE IF NOT EXISTS schema_migrations ('
            '  version    TEXT PRIMARY KEY,'
            '  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()'
            ')',
        )

        applied = {
            row[0]
            for row in connection.execute('SELECT version FROM schema_migrations')
        }

        newly_applied = []

        for migration_file in sorted(MIGRATIONS_DIR.glob('*.sql')):
            version = migration_file.stem

            if version in applied:
                continue

            connection.execute(migration_file.read_text())
            connection.execute(
                'INSERT INTO schema_migrations (version) VALUES (%s)',
                (version,),
            )
            newly_applied.append(version)

    return newly_applied
