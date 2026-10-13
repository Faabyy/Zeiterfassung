"""Prüfung von Buchungsfolgen. Einzige Stelle, an der die Regeln geprüft werden."""

from dataclasses import dataclass
from datetime import datetime

MINIMUM_REST_MINUTES = 11 * 60

WEEKDAYS_DE = ['Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.', 'So.']


@dataclass
class BookingEntry:
    type: str
    timestamp: datetime


def diff_in_minutes(start: datetime, end: datetime) -> int:
    return round((end - start).total_seconds() / 60)


def minutes_to_duration(total_minutes: int) -> str:
    return f'{total_minutes // 60}:{total_minutes % 60:02d} Std.'


def format_timestamp(timestamp: datetime) -> str:
    weekday = WEEKDAYS_DE[timestamp.weekday()]
    return f'{weekday}, {timestamp:%d.%m.}, {timestamp:%H:%M}'


# Erwartet eine chronologisch sortierte Buchungsfolge und liefert die erste
# Regelverletzung als Meldung oder None, wenn alles gültig ist.
def validate_booking_list(
    bookings: list[BookingEntry],
    allow_open_booking_sequence: bool,
) -> str | None:
    current_status = 'OUT'
    last_timestamp: datetime | None = None
    last_work_end_timestamp: datetime | None = None

    for booking in bookings:
        if last_timestamp is not None:
            if booking.timestamp == last_timestamp:
                return (
                    f'Am {format_timestamp(booking.timestamp)} existiert bereits eine Buchung. '
                    'Zwei Buchungen dürfen nicht denselben Zeitpunkt haben.'
                )

            if booking.timestamp < last_timestamp:
                return 'Der neue Zeitpunkt muss nach der letzten Buchung liegen.'

        if current_status == 'OUT':
            if booking.type != 'KOMMEN':
                return 'Wenn niemand eingestempelt ist, darf nur „Kommen“ gebucht werden.'

            if last_work_end_timestamp is not None:
                rest_minutes = diff_in_minutes(
                    last_work_end_timestamp,
                    booking.timestamp,
                )

                if rest_minutes < MINIMUM_REST_MINUTES:
                    return (
                        'Die gesetzliche Mindestruhezeit von 11 Stunden wurde nicht eingehalten. '
                        f'Seit dem letzten „Gehen“ sind erst {minutes_to_duration(rest_minutes)} vergangen.'
                    )

            current_status = 'WORKING'
            last_timestamp = booking.timestamp
            continue

        if current_status == 'WORKING':
            if booking.type not in ('PAUSE_START', 'GEHEN'):
                return 'Während der Arbeitszeit sind nur „Pause Start“ oder „Gehen“ erlaubt.'

            if booking.type == 'PAUSE_START':
                current_status = 'ON_BREAK'

            if booking.type == 'GEHEN':
                current_status = 'OUT'
                last_work_end_timestamp = booking.timestamp

            last_timestamp = booking.timestamp
            continue

        if current_status == 'ON_BREAK':
            if booking.type != 'PAUSE_ENDE':
                return 'Während einer laufenden Pause ist nur „Pause Ende“ erlaubt.'

            current_status = 'WORKING'
            last_timestamp = booking.timestamp
            continue

    if allow_open_booking_sequence:
        return None

    if current_status == 'WORKING':
        return 'Die Buchungsfolge wäre unvollständig: Zu „Kommen“ fehlt ein abschließendes „Gehen“.'

    if current_status == 'ON_BREAK':
        return 'Die Buchungsfolge wäre unvollständig: Zu „Pause Start“ fehlt ein „Pause Ende“.'

    return None
