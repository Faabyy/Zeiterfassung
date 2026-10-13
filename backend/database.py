import os
from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row


def get_connection_info() -> str:
    return psycopg.conninfo.make_conninfo(
        host='127.0.0.1',
        port=os.environ['POSTGRES_PORT'],
        dbname=os.environ['POSTGRES_DB'],
        user=os.environ['POSTGRES_USER'],
        password=os.environ['POSTGRES_PASSWORD'],
    )


# Öffnet eine Verbindung mit einer Transaktion: Commit bei Erfolg,
# Rollback bei jeder Exception.
@contextmanager
def transaction() -> Iterator[psycopg.Connection]:
    with psycopg.connect(get_connection_info(), row_factory=dict_row) as connection:
        yield connection
