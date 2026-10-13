from datetime import datetime

from validation import BookingEntry, validate_booking_list


def entry(booking_type: str, timestamp: str) -> BookingEntry:
    return BookingEntry(type=booking_type, timestamp=datetime.fromisoformat(timestamp))


def test_valid_day_with_break():
    bookings = [
        entry('KOMMEN', '2026-07-13T08:00'),
        entry('PAUSE_START', '2026-07-13T12:00'),
        entry('PAUSE_ENDE', '2026-07-13T12:30'),
        entry('GEHEN', '2026-07-13T16:30'),
    ]

    assert validate_booking_list(bookings, False) is None


def test_open_sequence_only_allowed_when_requested():
    bookings = [entry('KOMMEN', '2026-07-13T08:00')]

    assert validate_booking_list(bookings, True) is None
    assert 'fehlt ein abschließendes „Gehen“' in validate_booking_list(bookings, False)


def test_open_break_not_allowed_when_closed_sequence_required():
    bookings = [
        entry('KOMMEN', '2026-07-13T08:00'),
        entry('PAUSE_START', '2026-07-13T12:00'),
    ]

    assert 'fehlt ein „Pause Ende“' in validate_booking_list(bookings, False)


def test_first_booking_must_be_kommen():
    bookings = [entry('GEHEN', '2026-07-13T16:00')]

    assert 'nur „Kommen“' in validate_booking_list(bookings, True)


def test_no_kommen_while_working():
    bookings = [
        entry('KOMMEN', '2026-07-13T08:00'),
        entry('KOMMEN', '2026-07-13T09:00'),
    ]

    assert 'nur „Pause Start“ oder „Gehen“' in validate_booking_list(bookings, True)


def test_only_pause_ende_during_break():
    bookings = [
        entry('KOMMEN', '2026-07-13T08:00'),
        entry('PAUSE_START', '2026-07-13T12:00'),
        entry('GEHEN', '2026-07-13T16:00'),
    ]

    assert 'nur „Pause Ende“' in validate_booking_list(bookings, True)


def test_duplicate_timestamp():
    bookings = [
        entry('KOMMEN', '2026-07-18T08:00'),
        entry('GEHEN', '2026-07-18T08:00'),
    ]

    assert validate_booking_list(bookings, True) == (
        'Am Sa., 18.07., 08:00 existiert bereits eine Buchung. '
        'Zwei Buchungen dürfen nicht denselben Zeitpunkt haben.'
    )


def test_rest_period_too_short():
    bookings = [
        entry('KOMMEN', '2026-07-13T12:00'),
        entry('GEHEN', '2026-07-13T22:00'),
        entry('KOMMEN', '2026-07-14T08:30'),
    ]

    assert 'erst 10:30 Std. vergangen' in validate_booking_list(bookings, True)


def test_rest_period_exactly_eleven_hours():
    bookings = [
        entry('KOMMEN', '2026-07-13T12:00'),
        entry('GEHEN', '2026-07-13T21:00'),
        entry('KOMMEN', '2026-07-14T08:00'),
    ]

    assert validate_booking_list(bookings, True) is None
