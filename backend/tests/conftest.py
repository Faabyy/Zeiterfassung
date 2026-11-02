import os
from pathlib import Path

import psycopg
import pytest
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]

load_dotenv(ROOT_DIR / '.env')

# Die API-Tests laufen gegen eine eigene Datenbank im selben Container,
# damit die echten Buchungen unangetastet bleiben. Muss vor dem Import der
# App gesetzt werden; load_dotenv in app.py überschreibt es nicht.
MAIN_DATABASE = os.environ['POSTGRES_DB']
TEST_DATABASE = f'{MAIN_DATABASE}_test'
os.environ['POSTGRES_DB'] = TEST_DATABASE

# Feste Testbenutzer, unabhängig von der echten .env.
TEST_USERS = {'test': 'test-passwort', 'andere': 'andere-passwort'}
os.environ['APP_USERS'] = ','.join(
    f'{username}:{password}' for username, password in TEST_USERS.items()
)


def connect(database: str, **kwargs) -> psycopg.Connection:
    return psycopg.connect(
        host='127.0.0.1',
        port=os.environ['POSTGRES_PORT'],
        dbname=database,
        user=os.environ['POSTGRES_USER'],
        password=os.environ['POSTGRES_PASSWORD'],
        **kwargs,
    )


@pytest.fixture(scope='session')
def test_database():
    try:
        admin = connect(MAIN_DATABASE, autocommit=True)
    except psycopg.OperationalError as error:
        pytest.fail(
            'Datenbank nicht erreichbar. Läuft sie? (docker compose up -d)\n'
            f'{error}',
        )

    with admin:
        admin.execute(f'DROP DATABASE IF EXISTS "{TEST_DATABASE}" WITH (FORCE)')
        admin.execute(f'CREATE DATABASE "{TEST_DATABASE}"')

    from migrate import migrate

    with connect(TEST_DATABASE) as connection:
        migrate(connection)

    yield

    with connect(MAIN_DATABASE, autocommit=True) as admin:
        admin.execute(f'DROP DATABASE IF EXISTS "{TEST_DATABASE}" WITH (FORCE)')


def login(test_client, username: str) -> None:
    response = test_client.post(
        '/api/login',
        json={'username': username, 'password': TEST_USERS[username]},
    )
    assert response.status_code == 200, response.text


# Nicht angemeldeter Client. Beim Start legt das Backend die Testbenutzer an.
@pytest.fixture
def anonymous_client(test_database):
    from fastapi.testclient import TestClient

    from app import app

    with connect(TEST_DATABASE) as connection:
        connection.execute(
            'TRUNCATE bookings, booking_changes, sessions RESTART IDENTITY',
        )

    with TestClient(app) as test_client:
        yield test_client


# Als Benutzer "test" angemeldeter Client.
@pytest.fixture
def client(anonymous_client):
    login(anonymous_client, 'test')
    return anonymous_client


# Zweiter, unabhängiger Client als Benutzer "andere".
@pytest.fixture
def other_client(client):
    from fastapi.testclient import TestClient

    from app import app

    with TestClient(app) as test_client:
        login(test_client, 'andere')
        yield test_client


@pytest.fixture
def test_connection(test_database):
    with connect(TEST_DATABASE) as connection:
        yield connection
