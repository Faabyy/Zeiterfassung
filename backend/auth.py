"""Anmeldung: Benutzer aus der .env, Passwort-Hashes und Sitzungen."""

import hashlib
import hmac
import secrets

import psycopg

# Parameter für scrypt aus der Standardbibliothek.
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1


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


# Liest APP_USERS im Format "name:passwort,name2:passwort2".
def parse_users(value: str) -> dict[str, str]:
    users: dict[str, str] = {}

    for entry in value.split(','):
        username, separator, password = entry.strip().partition(':')

        if not separator or not username or not password:
            raise ValueError(
                f'APP_USERS: „{entry.strip()}“ hat nicht das Format name:passwort.',
            )

        if username in users:
            raise ValueError(f'APP_USERS: Benutzer „{username}“ ist doppelt.')

        users[username] = password

    return users


# Gleicht die Tabelle users mit der .env ab: neue Benutzer anlegen,
# Passwörter aktualisieren, entfernte Benutzer sperren. Buchungen ohne
# Benutzer erhält der erste Benutzer aus der .env.
def sync_users(connection: psycopg.Connection, users: dict[str, str]) -> None:
    with connection.transaction():
        for username, password in users.items():
            connection.execute(
                'INSERT INTO users (username, password_hash) VALUES (%s, %s) '
                'ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash',
                (username, hash_password(password)),
            )

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


# Liefert die ID des Benutzers oder None, wenn Name oder Passwort falsch sind.
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

    if row is None or not verify_password(password, row['password_hash']):
        return None

    return row['id']


def create_session(connection: psycopg.Connection, user_id: int) -> str:
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
        'WHERE sessions.token = %s AND users.password_hash IS NOT NULL',
        (token,),
    ).fetchone()


def delete_session(connection: psycopg.Connection, token: str) -> None:
    connection.execute('DELETE FROM sessions WHERE token = %s', (token,))
