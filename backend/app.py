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
from fastapi import Body, FastAPI, HTTPException
from pydantic import BaseModel, field_validator

from booking_groups import find_booking_group
from database import get_connection_info, transaction
from migrate import migrate
from validation import BookingEntry, validate_booking_list

load_dotenv(Path(__file__).resolve().parent.parent / '.env')

BookingType = Literal['KOMMEN', 'GEHEN', 'PAUSE_START', 'PAUSE_ENDE']

# Gleiches Format wie im Frontend (datetime-local), z. B. "2026-07-18T23:45".
TIMESTAMP_FORMAT = '%Y-%m-%dT%H:%M'


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


class Booking(BaseModel):
    id: int
    type: BookingType
    timestamp: str


class BookingChange(BaseModel):
    id: int
    booking_id: int
    action: Literal['CREATE', 'UPDATE', 'DELETE']
    old_type: BookingType | None
    old_timestamp: str | None
    new_type: BookingType | None
    new_timestamp: str | None
    changed_at: datetime


def format_timestamp(timestamp: datetime | None) -> str | None:
    return timestamp.strftime(TIMESTAMP_FORMAT) if timestamp else None


def to_booking(row: dict) -> Booking:
    return Booking(
        id=row['id'],
        type=row['type'],
        timestamp=row['timestamp'].strftime(TIMESTAMP_FORMAT),
    )


def load_bookings_for_update(connection: psycopg.Connection) -> list[dict]:
    # Sperrt die Tabelle bis zum Ende der Transaktion, damit zwischen Prüfung
    # und Schreiben niemand die Buchungsfolge verändert.
    connection.execute('LOCK TABLE bookings IN SHARE ROW EXCLUSIVE MODE')

    return connection.execute(
        'SELECT id, type, timestamp FROM bookings ORDER BY timestamp, id',
    ).fetchall()


# Hält eine Änderung im Protokoll fest (alte und neue Werte der Buchung).
def log_change(
    connection: psycopg.Connection,
    action: str,
    old: dict | None,
    new: dict | None,
) -> None:
    booking = new or old

    connection.execute(
        'INSERT INTO booking_changes '
        '(booking_id, action, old_type, old_timestamp, new_type, new_timestamp) '
        'VALUES (%s, %s, %s, %s, %s, %s)',
        (
            booking['id'],
            action,
            old['type'] if old else None,
            old['timestamp'] if old else None,
            new['type'] if new else None,
            new['timestamp'] if new else None,
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


logger = logging.getLogger('uvicorn.error')


# Bringt das Datenbankschema beim Start auf den neuesten Stand.
@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    with psycopg.connect(get_connection_info()) as connection:
        for version in migrate(connection):
            logger.info('Migration eingespielt: %s', version)

    yield


app = FastAPI(title='Zeiterfassung', lifespan=lifespan)


@app.get('/api/bookings')
def list_bookings() -> list[Booking]:
    with transaction() as connection:
        rows = connection.execute(
            'SELECT id, type, timestamp FROM bookings ORDER BY timestamp, id',
        ).fetchall()

    return [to_booking(row) for row in rows]


# Mehrere Buchungen (z. B. PAUSE_START + PAUSE_ENDE) werden gemeinsam
# geprüft, damit sich auch Paare in abgeschlossene Tage nachtragen lassen.
@app.post('/api/bookings', status_code=201)
def create_bookings(
    new_bookings: Annotated[list[BookingInput], Body(min_length=1)],
) -> list[Booking]:
    with transaction() as connection:
        rows = load_bookings_for_update(connection)
        new_rows = [
            {'type': booking.type, 'timestamp': booking.timestamp}
            for booking in new_bookings
        ]

        ensure_valid(rows + new_rows, allow_open_booking_sequence=True)

        created_rows = [
            connection.execute(
                'INSERT INTO bookings (type, timestamp) VALUES (%s, %s) '
                'RETURNING id, type, timestamp',
                (row['type'], row['timestamp']),
            ).fetchone()
            for row in new_rows
        ]

        for row in created_rows:
            log_change(connection, 'CREATE', old=None, new=row)

    return [to_booking(row) for row in created_rows]


@app.put('/api/bookings/{booking_id}')
def update_booking(booking_id: int, changes: BookingInput) -> Booking:
    with transaction() as connection:
        rows = load_bookings_for_update(connection)

        old_row = next((row for row in rows if row['id'] == booking_id), None)

        if old_row is None:
            raise HTTPException(
                status_code=404,
                detail='Die zu ändernde Buchung wurde nicht gefunden.',
            )

        updated_rows = [
            {'id': row['id'], 'type': changes.type, 'timestamp': changes.timestamp}
            if row['id'] == booking_id
            else row
            for row in rows
        ]

        ensure_valid(updated_rows, allow_open_booking_sequence=True)

        updated_row = connection.execute(
            'UPDATE bookings SET type = %s, timestamp = %s, updated_at = now() '
            'WHERE id = %s RETURNING id, type, timestamp',
            (changes.type, changes.timestamp, booking_id),
        ).fetchone()

        log_change(connection, 'UPDATE', old=old_row, new=updated_row)

    return to_booking(updated_row)


# Löscht die Buchung zusammen mit allem, was ohne sie ungültig würde
# (siehe find_booking_group), und liefert alle gelöschten Buchungen zurück.
@app.delete('/api/bookings/{booking_id}')
def delete_booking(booking_id: int) -> list[Booking]:
    with transaction() as connection:
        rows = load_bookings_for_update(connection)

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
            'RETURNING id, type, timestamp',
            (list(group_ids),),
        ).fetchall()

        deleted_rows.sort(key=lambda row: (row['timestamp'], row['id']))

        for row in deleted_rows:
            log_change(connection, 'DELETE', old=row, new=None)

    return [to_booking(row) for row in deleted_rows]


# Änderungsprotokoll, neueste Änderung zuerst.
@app.get('/api/booking-changes')
def list_booking_changes() -> list[BookingChange]:
    with transaction() as connection:
        rows = connection.execute(
            'SELECT * FROM booking_changes ORDER BY changed_at DESC, id DESC',
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


# Leert das Änderungsprotokoll und liefert die Anzahl gelöschter Einträge.
@app.delete('/api/booking-changes')
def clear_booking_changes() -> dict[str, int]:
    with transaction() as connection:
        deleted = connection.execute('DELETE FROM booking_changes').rowcount

    return {'deleted': deleted}


if __name__ == '__main__':
    # Nur lokal erreichbar, nicht aus dem Netzwerk.
    uvicorn.run(
        'app:app',
        host='127.0.0.1',
        port=int(os.environ['BACKEND_PORT']),
        reload=True,
    )
