import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Annotated, Literal

import psycopg
import uvicorn
from dotenv import load_dotenv
from fastapi import Body, Cookie, Depends, FastAPI, HTTPException, Response
from pydantic import BaseModel, field_validator

import auth
from booking_groups import find_booking_group
from database import get_connection_info, transaction
from migrate import migrate
from validation import (
    LOCAL_TIMEZONE,
    BookingEntry,
    validate_booking_list,
    validate_not_in_future,
)

load_dotenv(Path(__file__).resolve().parent.parent / '.env')

BookingType = Literal['KOMMEN', 'GEHEN', 'PAUSE_START', 'PAUSE_ENDE']
# STAMP: gestempelt, Zeitpunkt vom Server. BACKFILL: nachgetragen.
BookingSource = Literal['STAMP', 'BACKFILL']

# Gleiches Format wie im Frontend (datetime-local), z. B. "2026-07-18T23:45".
TIMESTAMP_FORMAT = '%Y-%m-%dT%H:%M'

SESSION_COOKIE = 'session'

# Spalten, die zu einer Buchung zurückgeliefert werden.
BOOKING_COLUMNS = 'id, type, timestamp, source, corrected'


class BookingInput(BaseModel):
    type: BookingType
    timestamp: datetime

    # Buchungen sind lokale Uhrzeiten ohne Zeitzone und minutengenau.
    @field_validator('timestamp')
    @classmethod
    def check_timestamp(cls, value: datetime) -> datetime:
        if value.tzinfo is not None:
            raise ValueError('Der Zeitpunkt darf keine Zeitzone enthalten.')

        return value.replace(second=0, microsecond=0)


class LoginInput(BaseModel):
    username: str
    password: str


class User(BaseModel):
    username: str


class StampInput(BaseModel):
    type: BookingType


class Booking(BaseModel):
    id: int
    type: BookingType
    timestamp: str
    source: BookingSource
    corrected: bool


class BookingChange(BaseModel):
    id: int
    booking_id: int
    action: Literal['CREATE', 'UPDATE', 'DELETE']
    old_type: BookingType | None
    old_timestamp: str | None
    new_type: BookingType | None
    new_timestamp: str | None
    source: BookingSource | None
    changed_at: datetime


def format_timestamp(timestamp: datetime | None) -> str | None:
    return timestamp.strftime(TIMESTAMP_FORMAT) if timestamp else None


def to_booking(row: dict) -> Booking:
    return Booking(
        id=row['id'],
        type=row['type'],
        timestamp=row['timestamp'].strftime(TIMESTAMP_FORMAT),
        source=row['source'],
        corrected=row['corrected'],
    )


# Aktuelle Uhrzeit in der Zeitzone der Buchungen, minutengenau. Nicht die
# Zeitzone des Servers, die z. B. in einem Container UTC sein kann.
def current_minute() -> datetime:
    return (
        datetime.now(LOCAL_TIMEZONE)
        .replace(tzinfo=None, second=0, microsecond=0)
    )


# Prüft das Sitzungs-Cookie und liefert den angemeldeten Benutzer.
def current_user(
    session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> dict:
    user = None

    if session:
        with transaction() as connection:
            user = auth.find_session_user(connection, session)

    if user is None:
        raise HTTPException(status_code=401, detail='Bitte zuerst anmelden.')

    return user


CurrentUser = Annotated[dict, Depends(current_user)]


def load_bookings(connection: psycopg.Connection, user_id: int) -> list[dict]:
    return connection.execute(
        f'SELECT {BOOKING_COLUMNS} FROM bookings '
        'WHERE user_id = %s ORDER BY timestamp, id',
        (user_id,),
    ).fetchall()


def load_bookings_for_update(
    connection: psycopg.Connection,
    user_id: int,
) -> list[dict]:
    # Sperrt die Tabelle bis zum Ende der Transaktion, damit zwischen Prüfung
    # und Schreiben niemand die Buchungsfolge verändert.
    connection.execute('LOCK TABLE bookings IN SHARE ROW EXCLUSIVE MODE')

    return load_bookings(connection, user_id)


# Hält eine Änderung im Protokoll fest (alte und neue Werte der Buchung).
def log_change(
    connection: psycopg.Connection,
    user_id: int,
    action: str,
    old: dict | None,
    new: dict | None,
) -> None:
    booking = new or old

    connection.execute(
        'INSERT INTO booking_changes '
        '(user_id, booking_id, action, old_type, old_timestamp, new_type, new_timestamp, source) '
        'VALUES (%s, %s, %s, %s, %s, %s, %s, %s)',
        (
            user_id,
            booking['id'],
            action,
            old['type'] if old else None,
            old['timestamp'] if old else None,
            new['type'] if new else None,
            new['timestamp'] if new else None,
            booking['source'],
        ),
    )


def ensure_valid(
    rows: list[dict],
    allow_open_booking_sequence: bool,
) -> None:
    entries = sorted(
        (BookingEntry(type=row['type'], timestamp=row['timestamp']) for row in rows),
        key=lambda entry: entry.timestamp,
    )

    validation_error = validate_booking_list(entries, allow_open_booking_sequence)

    if validation_error:
        raise HTTPException(status_code=400, detail=validation_error)


def ensure_not_in_future(timestamps: list[datetime]) -> None:
    validation_error = validate_not_in_future(timestamps, current_minute())

    if validation_error:
        raise HTTPException(status_code=400, detail=validation_error)


def insert_bookings(
    connection: psycopg.Connection,
    user_id: int,
    new_rows: list[dict],
    source: str,
) -> list[dict]:
    created_rows = [
        connection.execute(
            'INSERT INTO bookings (user_id, type, timestamp, source) '
            f'VALUES (%s, %s, %s, %s) RETURNING {BOOKING_COLUMNS}',
            (user_id, row['type'], row['timestamp'], source),
        ).fetchone()
        for row in new_rows
    ]

    for row in created_rows:
        log_change(connection, user_id, 'CREATE', old=None, new=row)

    return created_rows


logger = logging.getLogger('uvicorn.error')


# Bringt das Datenbankschema beim Start auf den neuesten Stand und
# übernimmt die Benutzer aus der .env.
@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    if not os.environ.get('APP_USERS'):
        raise RuntimeError('APP_USERS fehlt in der .env (Vorlage: .env.example).')

    users = auth.parse_users(os.environ['APP_USERS'])

    with psycopg.connect(get_connection_info()) as connection:
        for version in migrate(connection):
            logger.info('Migration eingespielt: %s', version)

        auth.sync_users(connection, users)

    logger.info('Benutzer: %s', ', '.join(users))

    yield


app = FastAPI(title='Zeiterfassung', lifespan=lifespan)


@app.post('/api/login')
def login(credentials: LoginInput, response: Response) -> User:
    locked_minutes = auth.locked_minutes(credentials.username)

    if locked_minutes:
        raise HTTPException(
            status_code=429,
            detail=(
                'Zu viele fehlgeschlagene Anmeldungen. Bitte in '
                f'{locked_minutes} Minuten erneut versuchen.'
            ),
        )

    with transaction() as connection:
        user_id = auth.check_login(
            connection, credentials.username, credentials.password,
        )

        if user_id is None:
            raise HTTPException(
                status_code=401,
                detail='Benutzername oder Passwort ist falsch.',
            )

        token = auth.create_session(connection, user_id)

    # HttpOnly: Das Frontend kommt nicht an den Token, nur der Browser.
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite='strict',
        max_age=int(auth.SESSION_LIFETIME.total_seconds()),
    )

    return User(username=credentials.username)


@app.post('/api/logout', status_code=204)
def logout(
    response: Response,
    session: Annotated[str | None, Cookie(alias=SESSION_COOKIE)] = None,
) -> None:
    if session:
        with transaction() as connection:
            auth.delete_session(connection, session)

    response.delete_cookie(SESSION_COOKIE)


@app.get('/api/me')
def me(user: CurrentUser) -> User:
    return User(username=user['username'])


@app.get('/api/bookings')
def list_bookings(user: CurrentUser) -> list[Booking]:
    with transaction() as connection:
        rows = load_bookings(connection, user['id'])

    return [to_booking(row) for row in rows]


# Stempeln: Der Zeitpunkt kommt immer vom Server, damit nicht in die
# Vergangenheit oder Zukunft gestempelt werden kann.
@app.post('/api/bookings/stamp', status_code=201)
def stamp_booking(stamp: StampInput, user: CurrentUser) -> Booking:
    with transaction() as connection:
        rows = load_bookings_for_update(connection, user['id'])
        new_row = {'type': stamp.type, 'timestamp': current_minute()}

        # Buchungen sind minutengenau; zwei Stempel in derselben Minute
        # hätten denselben Zeitpunkt.
        if any(row['timestamp'] == new_row['timestamp'] for row in rows):
            raise HTTPException(
                status_code=400,
                detail=(
                    'In dieser Minute wurde bereits gestempelt. Bitte bis zur '
                    'nächsten Minute warten oder die letzte Buchung korrigieren.'
                ),
            )

        ensure_valid([*rows, new_row], allow_open_booking_sequence=True)

        [created_row] = insert_bookings(connection, user['id'], [new_row], 'STAMP')

    return to_booking(created_row)


# Nachtragen mit eigenem Zeitpunkt. Mehrere Buchungen (z. B. PAUSE_START +
# PAUSE_ENDE) werden gemeinsam geprüft, damit sich auch Paare in
# abgeschlossene Tage nachtragen lassen.
@app.post('/api/bookings', status_code=201)
def create_bookings(
    new_bookings: Annotated[list[BookingInput], Body(min_length=1)],
    user: CurrentUser,
) -> list[Booking]:
    with transaction() as connection:
        rows = load_bookings_for_update(connection, user['id'])
        new_rows = [
            {'type': booking.type, 'timestamp': booking.timestamp}
            for booking in new_bookings
        ]

        ensure_not_in_future([row['timestamp'] for row in new_rows])
        ensure_valid(rows + new_rows, allow_open_booking_sequence=True)

        created_rows = insert_bookings(connection, user['id'], new_rows, 'BACKFILL')

    return [to_booking(row) for row in created_rows]


@app.put('/api/bookings/{booking_id}')
def update_booking(
    booking_id: int,
    changes: BookingInput,
    user: CurrentUser,
) -> Booking:
    with transaction() as connection:
        # Nur eigene Buchungen: fremde IDs werden nicht gefunden (404).
        rows = load_bookings_for_update(connection, user['id'])

        old_row = next((row for row in rows if row['id'] == booking_id), None)

        if old_row is None:
            raise HTTPException(
                status_code=404,
                detail='Die zu ändernde Buchung wurde nicht gefunden.',
            )

        # Unveränderte Korrektur: nichts speichern, nichts protokollieren.
        if (old_row['type'], old_row['timestamp']) == (changes.type, changes.timestamp):
            return to_booking(old_row)

        ensure_not_in_future([changes.timestamp])

        updated_rows = [
            {'id': row['id'], 'type': changes.type, 'timestamp': changes.timestamp}
            if row['id'] == booking_id
            else row
            for row in rows
        ]

        ensure_valid(updated_rows, allow_open_booking_sequence=True)

        updated_row = connection.execute(
            'UPDATE bookings SET type = %s, timestamp = %s, corrected = true, '
            f'updated_at = now() WHERE id = %s RETURNING {BOOKING_COLUMNS}',
            (changes.type, changes.timestamp, booking_id),
        ).fetchone()

        log_change(connection, user['id'], 'UPDATE', old=old_row, new=updated_row)

    return to_booking(updated_row)


# Löscht die Buchung zusammen mit allem, was ohne sie ungültig würde
# (siehe find_booking_group), und liefert alle gelöschten Buchungen zurück.
@app.delete('/api/bookings/{booking_id}')
def delete_booking(booking_id: int, user: CurrentUser) -> list[Booking]:
    with transaction() as connection:
        rows = load_bookings_for_update(connection, user['id'])

        if not any(row['id'] == booking_id for row in rows):
            raise HTTPException(
                status_code=404,
                detail='Die zu löschende Buchung wurde nicht gefunden.',
            )

        group_ids = set(find_booking_group(rows, booking_id))
        remaining_rows = [row for row in rows if row['id'] not in group_ids]

        # Eine offene Schicht am Ende (noch eingestempelt) bleibt erlaubt.
        ensure_valid(remaining_rows, allow_open_booking_sequence=True)

        deleted_rows = connection.execute(
            'DELETE FROM bookings WHERE id = ANY(%s) '
            f'RETURNING {BOOKING_COLUMNS}',
            (list(group_ids),),
        ).fetchall()

        deleted_rows.sort(key=lambda row: (row['timestamp'], row['id']))

        for row in deleted_rows:
            log_change(connection, user['id'], 'DELETE', old=row, new=None)

    return [to_booking(row) for row in deleted_rows]


# Änderungsprotokoll, neueste Änderung zuerst. Es lässt sich bewusst nicht
# leeren, damit Korrekturen nachvollziehbar bleiben.
@app.get('/api/booking-changes')
def list_booking_changes(user: CurrentUser) -> list[BookingChange]:
    with transaction() as connection:
        rows = connection.execute(
            'SELECT * FROM booking_changes WHERE user_id = %s '
            'ORDER BY changed_at DESC, id DESC',
            (user['id'],),
        ).fetchall()

    return [
        BookingChange(
            **{
                **row,
                'old_timestamp': format_timestamp(row['old_timestamp']),
                'new_timestamp': format_timestamp(row['new_timestamp']),
            },
        )
        for row in rows
    ]


if __name__ == '__main__':
    # Nur lokal erreichbar, nicht aus dem Netzwerk.
    uvicorn.run(
        'app:app',
        host='127.0.0.1',
        port=int(os.environ['BACKEND_PORT']),
        reload=True,
    )
