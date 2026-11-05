import pytest

import auth
from auth import hash_password, parse_users, sync_users, verify_password
from tests.conftest import TEST_USERS

DAY = [
    {'type': 'KOMMEN', 'timestamp': '2026-07-18T08:00'},
    {'type': 'GEHEN', 'timestamp': '2026-07-18T16:30'},
]


def test_password_hash_round_trip():
    password_hash = hash_password('geheim')

    assert 'geheim' not in password_hash
    assert verify_password('geheim', password_hash)
    assert not verify_password('falsch', password_hash)


def test_parse_users():
    assert parse_users('max:eins, anna:zwei:drei') == {'max': 'eins', 'anna': 'zwei:drei'}


def test_parse_users_keeps_spaces_in_password():
    assert parse_users('max: mit leerzeichen ') == {'max': ' mit leerzeichen '}


@pytest.mark.parametrize('value', ['', 'max', 'max:', ':geheim', 'max:a,max:b'])
def test_parse_users_rejects_invalid_value(value):
    with pytest.raises(ValueError):
        parse_users(value)


def test_requests_without_login_are_rejected(anonymous_client):
    for method, url in [
        ('GET', '/api/bookings'),
        ('POST', '/api/bookings/stamp'),
        ('GET', '/api/booking-changes'),
        ('GET', '/api/me'),
    ]:
        response = anonymous_client.request(method, url, json={'type': 'KOMMEN'})

        assert response.status_code == 401, url
        assert response.json()['detail'] == 'Bitte zuerst anmelden.'


def test_login_with_wrong_password_is_rejected(anonymous_client):
    for username, password in [('test', 'falsch'), ('unbekannt', 'test-passwort')]:
        response = anonymous_client.post(
            '/api/login', json={'username': username, 'password': password},
        )

        assert response.status_code == 401
        assert response.json()['detail'] == 'Benutzername oder Passwort ist falsch.'


def test_login_sets_http_only_cookie(anonymous_client):
    response = anonymous_client.post(
        '/api/login', json={'username': 'test', 'password': TEST_USERS['test']},
    )

    assert response.status_code == 200
    assert response.json() == {'username': 'test'}
    assert 'HttpOnly' in response.headers['set-cookie']
    assert anonymous_client.get('/api/me').json() == {'username': 'test'}


def test_logout_ends_session(client):
    assert client.post('/api/logout').status_code == 204
    assert client.get('/api/me').status_code == 401


def test_users_only_see_their_own_bookings(client, other_client):
    client.post('/api/bookings', json=DAY)

    assert len(client.get('/api/bookings').json()) == 2
    assert other_client.get('/api/bookings').json() == []
    assert other_client.get('/api/booking-changes').json() == []


def test_booking_rules_apply_per_user(client, other_client):
    client.post('/api/bookings', json=DAY)

    # Derselbe Zeitpunkt und keine Ruhezeit-Verletzung beim anderen Benutzer.
    response = other_client.post('/api/bookings', json=DAY)

    assert response.status_code == 201, response.text


def test_foreign_bookings_cannot_be_changed(client, other_client):
    [booking, _] = client.post('/api/bookings', json=DAY).json()

    update = other_client.put(
        f"/api/bookings/{booking['id']}",
        json={'type': 'KOMMEN', 'timestamp': '2026-07-18T09:00'},
    )
    delete = other_client.delete(f"/api/bookings/{booking['id']}")

    assert update.status_code == 404
    assert delete.status_code == 404
    assert len(client.get('/api/bookings').json()) == 2


def test_removed_user_can_no_longer_log_in(client, test_connection):
    sync_users(test_connection, {'andere': TEST_USERS['andere']})

    assert client.get('/api/me').status_code == 401

    # Für die übrigen Tests den Ausgangszustand wiederherstellen.
    sync_users(test_connection, TEST_USERS)


def test_bookings_without_user_go_to_first_user(client, test_connection):
    with test_connection.transaction():
        test_connection.execute(
            "INSERT INTO bookings (type, timestamp) VALUES ('KOMMEN', '2026-07-18T08:00')",
        )

    sync_users(test_connection, TEST_USERS)

    assert [booking['timestamp'] for booking in client.get('/api/bookings').json()] == [
        '2026-07-18T08:00',
    ]


def test_password_change_ends_sessions(client, test_connection):
    sync_users(test_connection, {**TEST_USERS, 'test': 'neues-passwort'})

    assert client.get('/api/me').status_code == 401

    sync_users(test_connection, TEST_USERS)


def test_unchanged_password_keeps_sessions(client, test_connection):
    sync_users(test_connection, TEST_USERS)

    assert client.get('/api/me').status_code == 200


def test_expired_session_is_rejected(client, test_connection):
    with test_connection.transaction():
        test_connection.execute(
            "UPDATE sessions SET created_at = now() - interval '13 hours'",
        )

    assert client.get('/api/me').status_code == 401


def test_login_is_locked_after_too_many_failures(anonymous_client):
    for _ in range(auth.MAX_FAILED_LOGINS):
        response = anonymous_client.post(
            '/api/login', json={'username': 'test', 'password': 'falsch'},
        )
        assert response.status_code == 401

    response = anonymous_client.post(
        '/api/login', json={'username': 'test', 'password': TEST_USERS['test']},
    )

    assert response.status_code == 429
    assert 'Zu viele fehlgeschlagene Anmeldungen' in response.json()['detail']
