"""Anmeldung: Benutzer aus der .env, Passwort-Hashes und Sitzungen."""

import hashlib
import hmac
import secrets
import time
from datetime import timedelta

import psycopg

# Parameter für scrypt aus der Standardbibliothek.
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1

# Nach dieser Zeit muss man sich neu anmelden.
SESSION_LIFETIME = timedelta(hours=12)

# Nach so vielen Fehlversuchen für einen Benutzernamen wird er gesperrt.
MAX_FAILED_LOGINS = 5
LOGIN_LOCK_SECONDS = 15 * 60

# Benutzername -> Zeitpunkte der letzten Fehlversuche (time.monotonic()).
# Nur im Speicher: Ein Neustart des Backends hebt Sperren auf.
failed_logins: dict[str, list[float]] = {}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P,
    )
    return f'{salt.hex()}${digest.hex()}'


def verify_password(password: str, password_hash: str) -> bool:
    salt_hex, digest_hex = password_hash.split('$')
    digest = hashlib.scrypt(
        password.encode(),
        salt=bytes.fromhex(salt_hex),
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
    )
    return hmac.compare_digest(digest.hex(), digest_hex)


# Liest APP_USERS im Format "name:passwort,name2:passwort2". Leerzeichen
# um den Namen werden entfernt, im Passwort bleiben sie erhalten.
def parse_users(value: str) -> dict[str, str]:
    users: dict[str, str] = {}

    for entry in value.split(','):
        username, separator, password = entry.partition(':')
        username = username.strip()

        if not separator or not username or not password:
            raise ValueError(
                f'APP_USERS: „{entry.strip()}“ hat nicht das Format name:passwort.',
            )

        if username in users:
            raise ValueError(f'APP_USERS: Benutzer „{username}“ ist doppelt.')

        users[username] = password

    return users


# Gleicht die Tabelle users mit der .env ab: neue Benutzer anlegen,
# geänderte Passwörter übernehmen (bestehende Sitzungen enden dann),
# entfernte Benutzer sperren. Buchungen ohne Benutzer erhält der erste
# Benutzer aus der .env.
def sync_users(connection: psycopg.Connection, users: dict[str, str]) -> None:
    with connection.transaction():
        for username, password in users.items():
            row = connection.execute(
                'SELECT id, password_hash FROM users WHERE username = %s',
                (username,),
            ).fetchone()

            if row is None:
                connection.execute(
                    'INSERT INTO users (username, password_hash) VALUES (%s, %s)',
                    (username, hash_password(password)),
                )
                continue

            user_id, password_hash = row[0], row[1]

            if password_hash and verify_password(password, password_hash):
                continue

            connection.execute(
                'UPDATE users SET password_hash = %s WHERE id = %s',
                (hash_password(password), user_id),
            )
            connection.execute('DELETE FROM sessions WHERE user_id = %s', (user_id,))

        connection.execute(
            'UPDATE users SET password_hash = NULL WHERE NOT username = ANY(%s)',
            (list(users),),
        )
        connection.execute(
            'DELETE FROM sessions WHERE user_id IN '
            '(SELECT id FROM users WHERE password_hash IS NULL)',
        )

        first_user_id = connection.execute(
            'SELECT id FROM users WHERE username = %s',
            (next(iter(users)),),
        ).fetchone()[0]

        for table in ('bookings', 'booking_changes'):
            connection.execute(
                f'UPDATE {table} SET user_id = %s WHERE user_id IS NULL',
                (first_user_id,),
            )


# Vergleichs-Hash für unbekannte Benutzer: Die Prüfung dauert dann genauso
# lange, an der Antwortzeit lässt sich nicht ablesen, ob es den Namen gibt.
DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(16))


def recent_failures(username: str) -> list[float]:
    now = time.monotonic()
    failures = [
        moment
        for moment in failed_logins.get(username, [])
        if now - moment < LOGIN_LOCK_SECONDS
    ]

    if failures:
        failed_logins[username] = failures
    else:
        failed_logins.pop(username, None)

    return failures


# Liefert die restlichen Minuten der Sperre oder 0, wenn nicht gesperrt.
def locked_minutes(username: str) -> int:
    failures = recent_failures(username)

    if len(failures) < MAX_FAILED_LOGINS:
        return 0

    remaining = LOGIN_LOCK_SECONDS - (time.monotonic() - failures[-MAX_FAILED_LOGINS])
    return max(1, round(remaining / 60))


# Liefert die ID des Benutzers oder None, wenn Name oder Passwort falsch sind.
# Fehlversuche werden für die Sperre gezählt.
def check_login(
    connection: psycopg.Connection,
    username: str,
    password: str,
) -> int | None:
    row = connection.execute(
        'SELECT id, password_hash FROM users '
        'WHERE username = %s AND password_hash IS NOT NULL',
        (username,),
    ).fetchone()

    password_hash = row['password_hash'] if row else DUMMY_PASSWORD_HASH

    if not verify_password(password, password_hash) or row is None:
        failed_logins[username] = [*recent_failures(username), time.monotonic()]
        return None

    failed_logins.pop(username, None)
    return row['id']


def create_session(connection: psycopg.Connection, user_id: int) -> str:
    # Abgelaufene Sitzungen bei der Gelegenheit aufräumen.
    connection.execute(
        'DELETE FROM sessions WHERE created_at < now() - %s',
        (SESSION_LIFETIME,),
    )

    token = secrets.token_urlsafe(32)
    connection.execute(
        'INSERT INTO sessions (token, user_id) VALUES (%s, %s)',
        (token, user_id),
    )
    return token


# Liefert ID und Namen des angemeldeten Benutzers oder None.
def find_session_user(
    connection: psycopg.Connection,
    token: str,
) -> dict | None:
    return connection.execute(
        'SELECT users.id, users.username FROM sessions '
        'JOIN users ON users.id = sessions.user_id '
        'WHERE sessions.token = %s AND users.password_hash IS NOT NULL '
        'AND sessions.created_at >= now() - %s',
        (token, SESSION_LIFETIME),
    ).fetchone()


def delete_session(connection: psycopg.Connection, token: str) -> None:
    connection.execute('DELETE FROM sessions WHERE token = %s', (token,))
