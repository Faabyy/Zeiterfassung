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


@pytest.fixture
def client(test_database):
    from fastapi.testclient import TestClient

    from app import app

    with connect(TEST_DATABASE) as connection:
        connection.execute('TRUNCATE bookings, booking_changes RESTART IDENTITY')

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def test_connection(test_database):
    with connect(TEST_DATABASE) as connection:
        yield connection
