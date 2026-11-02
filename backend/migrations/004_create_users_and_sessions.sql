-- Benutzer kommen aus der .env (APP_USERS) und werden beim Start des
-- Backends abgeglichen (siehe auth.sync_users). Eine Registrierung gibt es
-- nicht. Ist password_hash NULL, steht der Benutzer nicht mehr in der .env
-- und kann sich nicht anmelden; seine Buchungen bleiben erhalten.
CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    username      TEXT        NOT NULL UNIQUE,
    password_hash TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Angemeldete Sitzungen, der Token steht im Cookie "session".
CREATE TABLE sessions (
    token      TEXT        PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Buchungen und Protokoll gehören einem Benutzer. Bestehende Einträge ohne
-- Benutzer erhält beim Start der erste Benutzer aus der .env.
ALTER TABLE bookings ADD COLUMN user_id BIGINT REFERENCES users (id);
ALTER TABLE booking_changes ADD COLUMN user_id BIGINT REFERENCES users (id);

-- Zwei Buchungen desselben Benutzers dürfen nicht denselben Zeitpunkt haben.
ALTER TABLE bookings DROP CONSTRAINT bookings_timestamp_unique;
ALTER TABLE bookings
    ADD CONSTRAINT bookings_user_timestamp_unique UNIQUE (user_id, timestamp);
