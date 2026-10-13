-- Erste Migration. IF NOT EXISTS, weil Datenbanken von vor der Einführung
-- der Migrationen die Tabelle bereits enthalten.

-- Buchungen speichern die lokale Uhrzeit ohne Zeitzone, wie sie im Frontend
-- erfasst wird (z. B. "2026-07-18T23:45"). Wochentag und Zuschläge beziehen
-- sich auf genau diese lokale Zeit.
CREATE TABLE IF NOT EXISTS bookings (
    id         BIGSERIAL PRIMARY KEY,
    type       TEXT      NOT NULL
               CHECK (type IN ('KOMMEN', 'GEHEN', 'PAUSE_START', 'PAUSE_ENDE')),
    timestamp  TIMESTAMP NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Zwei Buchungen dürfen nicht denselben Zeitpunkt haben.
    CONSTRAINT bookings_timestamp_unique UNIQUE (timestamp)
);
