from booking_groups import find_booking_group

# Zwei abgeschlossene Schichten, die erste mit zwei Pausen.
CLOSED_DAYS = [
    {'id': 1, 'type': 'KOMMEN'},
    {'id': 2, 'type': 'PAUSE_START'},
    {'id': 3, 'type': 'PAUSE_ENDE'},
    {'id': 4, 'type': 'PAUSE_START'},
    {'id': 5, 'type': 'PAUSE_ENDE'},
    {'id': 6, 'type': 'GEHEN'},
    {'id': 7, 'type': 'KOMMEN'},
    {'id': 8, 'type': 'GEHEN'},
]

# Noch eingestempelt und in einer laufenden Pause.
OPEN_DAY = [
    {'id': 1, 'type': 'KOMMEN'},
    {'id': 2, 'type': 'GEHEN'},
    {'id': 3, 'type': 'KOMMEN'},
    {'id': 4, 'type': 'PAUSE_START'},
]


def test_kommen_deletes_whole_shift_with_pauses():
    assert find_booking_group(CLOSED_DAYS, 1) == [1, 2, 3, 4, 5, 6]


def test_gehen_deletes_whole_shift_with_pauses():
    assert find_booking_group(CLOSED_DAYS, 6) == [1, 2, 3, 4, 5, 6]


def test_shift_without_pauses():
    assert find_booking_group(CLOSED_DAYS, 8) == [7, 8]


def test_pause_start_deletes_pause_pair():
    assert find_booking_group(CLOSED_DAYS, 4) == [4, 5]


def test_pause_ende_deletes_pause_pair():
    assert find_booking_group(CLOSED_DAYS, 3) == [2, 3]


def test_open_shift_deletes_open_bookings():
    assert find_booking_group(OPEN_DAY, 3) == [3, 4]


def test_open_pause_deletes_only_pause_start():
    assert find_booking_group(OPEN_DAY, 4) == [4]
