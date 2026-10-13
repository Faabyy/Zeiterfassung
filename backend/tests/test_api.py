URL = '/api/bookings'

DAY_WITH_PAUSE = [
    {'type': 'KOMMEN', 'timestamp': '2026-07-18T08:00'},
    {'type': 'PAUSE_START', 'timestamp': '2026-07-18T12:00'},
    {'type': 'PAUSE_ENDE', 'timestamp': '2026-07-18T12:30'},
    {'type': 'GEHEN', 'timestamp': '2026-07-18T16:30'},
]


def create(client, *bookings):
    response = client.post(URL, json=list(bookings))
    assert response.status_code == 201, response.text
    return response.json()


def stored(client):
    return [(booking['type'], booking['timestamp']) for booking in client.get(URL).json()]


def test_list_is_empty_initially(client):
    response = client.get(URL)

    assert response.status_code == 200
    assert response.json() == []


def test_create_returns_bookings_with_ids(client):
    created = create(client, *DAY_WITH_PAUSE)

    assert [booking['id'] for booking in created] == [1, 2, 3, 4]
    assert stored(client) == [
        ('KOMMEN', '2026-07-18T08:00'),
        ('PAUSE_START', '2026-07-18T12:00'),
        ('PAUSE_ENDE', '2026-07-18T12:30'),
        ('GEHEN', '2026-07-18T16:30'),
    ]


def test_pause_pair_can_be_added_to_closed_day(client):
    create(client, DAY_WITH_PAUSE[0], DAY_WITH_PAUSE[3])
    create(client, DAY_WITH_PAUSE[1], DAY_WITH_PAUSE[2])

    assert [booking_type for booking_type, _ in stored(client)] == [
        'KOMMEN', 'PAUSE_START', 'PAUSE_ENDE', 'GEHEN',
    ]


def test_seconds_are_dropped(client):
    created = create(client, {'type': 'KOMMEN', 'timestamp': '2026-07-18T08:00:42'})

    assert created[0]['timestamp'] == '2026-07-18T08:00'


def test_rule_violation_is_rejected_and_nothing_is_stored(client):
    create(client, *DAY_WITH_PAUSE)

    response = client.post(URL, json=[
        {'type': 'KOMMEN', 'timestamp': '2026-07-19T01:00'},
        {'type': 'GEHEN', 'timestamp': '2026-07-19T02:00'},
    ])

    assert response.status_code == 400
    assert 'Mindestruhezeit von 11 Stunden' in response.json()['detail']
    assert len(stored(client)) == 4


def test_invalid_input_is_rejected(client):
    invalid_bodies = [
        [],
        [{'type': 'FOO', 'timestamp': '2026-07-18T08:00'}],
        [{'type': 'KOMMEN', 'timestamp': 'gestern'}],
        [{'type': 'KOMMEN', 'timestamp': '2026-07-18T08:00+02:00'}],
    ]

    for body in invalid_bodies:
        assert client.post(URL, json=body).status_code == 422, body

    assert stored(client) == []


def test_update_corrects_booking(client):
    create(client, *DAY_WITH_PAUSE)

    response = client.put(f'{URL}/4', json={'type': 'GEHEN', 'timestamp': '2026-07-18T17:00'})

    assert response.status_code == 200
    assert response.json() == {'id': 4, 'type': 'GEHEN', 'timestamp': '2026-07-18T17:00'}
    assert stored(client)[-1] == ('GEHEN', '2026-07-18T17:00')


def test_invalid_update_is_rejected_and_nothing_changes(client):
    create(client, *DAY_WITH_PAUSE)

    response = client.put(f'{URL}/4', json={'type': 'GEHEN', 'timestamp': '2026-07-18T12:15'})

    assert response.status_code == 400
    assert response.json()['detail'] == 'Während einer laufenden Pause ist nur „Pause Ende“ erlaubt.'
    assert stored(client)[-1] == ('GEHEN', '2026-07-18T16:30')


def test_update_unknown_booking(client):
    response = client.put(f'{URL}/99', json={'type': 'GEHEN', 'timestamp': '2026-07-18T17:00'})

    assert response.status_code == 404


def test_delete_shift_removes_its_pauses(client):
    create(client, *DAY_WITH_PAUSE)
    create(client, {'type': 'KOMMEN', 'timestamp': '2026-07-20T08:00'})

    response = client.delete(f'{URL}/4')

    assert response.status_code == 200
    assert [booking['id'] for booking in response.json()] == [1, 2, 3, 4]
    assert stored(client) == [('KOMMEN', '2026-07-20T08:00')]


def test_delete_pause_removes_pause_pair(client):
    create(client, *DAY_WITH_PAUSE)

    response = client.delete(f'{URL}/2')

    assert [booking['id'] for booking in response.json()] == [2, 3]
    assert stored(client) == [
        ('KOMMEN', '2026-07-18T08:00'),
        ('GEHEN', '2026-07-18T16:30'),
    ]


def test_delete_open_shift(client):
    create(client, *DAY_WITH_PAUSE)
    create(client, {'type': 'KOMMEN', 'timestamp': '2026-07-20T08:00'})

    response = client.delete(f'{URL}/5')

    assert [booking['id'] for booking in response.json()] == [5]
    assert len(stored(client)) == 4


def test_delete_unknown_booking(client):
    response = client.delete(f'{URL}/99')

    assert response.status_code == 404


def test_migrations_are_applied_only_once(client, test_connection):
    from migrate import MIGRATIONS_DIR, migrate

    assert migrate(test_connection) == []

    versions = [
        row[0]
        for row in test_connection.execute('SELECT version FROM schema_migrations ORDER BY version')
    ]

    assert versions == sorted(path.stem for path in MIGRATIONS_DIR.glob('*.sql'))


def changes(client):
    return [
        (
            change['booking_id'],
            change['action'],
            change['old_type'],
            change['old_timestamp'],
            change['new_type'],
            change['new_timestamp'],
        )
        for change in client.get('/api/booking-changes').json()
    ]


def test_history_records_create_update_and_delete(client):
    create(client, DAY_WITH_PAUSE[0], DAY_WITH_PAUSE[3])
    client.put(f'{URL}/2', json={'type': 'GEHEN', 'timestamp': '2026-07-18T17:00'})
    client.delete(f'{URL}/1')

    # Neueste Änderung zuerst.
    assert changes(client) == [
        (2, 'DELETE', 'GEHEN', '2026-07-18T17:00', None, None),
        (1, 'DELETE', 'KOMMEN', '2026-07-18T08:00', None, None),
        (2, 'UPDATE', 'GEHEN', '2026-07-18T16:30', 'GEHEN', '2026-07-18T17:00'),
        (2, 'CREATE', None, None, 'GEHEN', '2026-07-18T16:30'),
        (1, 'CREATE', None, None, 'KOMMEN', '2026-07-18T08:00'),
    ]


def test_rejected_change_is_not_recorded(client):
    create(client, *DAY_WITH_PAUSE)

    client.put(f'{URL}/4', json={'type': 'GEHEN', 'timestamp': '2026-07-18T12:15'})
    client.post(URL, json=[{'type': 'KOMMEN', 'timestamp': '2026-07-19T01:00'}])

    assert [change[1] for change in changes(client)] == ['CREATE'] * 4


def test_history_can_be_cleared(client):
    create(client, *DAY_WITH_PAUSE)

    response = client.delete('/api/booking-changes')

    assert response.status_code == 200
    assert response.json() == {'deleted': 4}
    assert changes(client) == []
    assert len(stored(client)) == 4
