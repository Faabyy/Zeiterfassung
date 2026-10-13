-- Änderungsprotokoll: Jede Anlage, Korrektur und Löschung einer Buchung wird
-- mit altem und neuem Wert festgehalten. Ohne Fremdschlüssel, damit die
-- Einträge auch nach dem Löschen der Buchung erhalten bleiben.
CREATE TABLE booking_changes (
    id            BIGSERIAL PRIMARY KEY,
    booking_id    BIGINT      NOT NULL,
    action        TEXT        NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
    old_type      TEXT,
    old_timestamp TIMESTAMP,
    new_type      TEXT,
    new_timestamp TIMESTAMP,
    changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
