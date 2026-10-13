"""Zusammengehörige Buchungen finden, die nur gemeinsam gelöscht werden dürfen."""


# Erwartet eine chronologisch sortierte, gültige Buchungsfolge (Dicts mit
# "id" und "type") und liefert die IDs, die mit der Buchung zusammen
# gelöscht werden müssen, damit die Folge gültig bleibt:
# - KOMMEN oder GEHEN: die ganze Schicht inklusive ihrer Pausen
# - PAUSE_START oder PAUSE_ENDE: das Pausenpaar
# Offene Schichten und Pausen am Ende bilden eine Gruppe ohne Gegenstück.
def find_booking_group(rows: list[dict], booking_id: int) -> list[int]:
    shift_by_id: dict[int, list[int]] = {}
    pause_by_id: dict[int, list[int]] = {}

    shift: list[int] = []
    pause: list[int] = []

    for row in rows:
        shift.append(row['id'])

        if row['type'] == 'PAUSE_START':
            pause = [row['id']]

        if row['type'] == 'PAUSE_ENDE':
            pause.append(row['id'])

            for pause_id in pause:
                pause_by_id[pause_id] = pause

            pause = []

        if row['type'] == 'GEHEN':
            for shift_id in shift:
                shift_by_id[shift_id] = shift

            shift = []

    for shift_id in shift:
        shift_by_id[shift_id] = shift

    for pause_id in pause:
        pause_by_id[pause_id] = pause

    booking_type = next(row['type'] for row in rows if row['id'] == booking_id)

    if booking_type in ('KOMMEN', 'GEHEN'):
        return shift_by_id[booking_id]

    return pause_by_id[booking_id]
