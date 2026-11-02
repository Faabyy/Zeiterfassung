-- Herkunft einer Buchung: gestempelt (Zeitpunkt vom Server) oder
-- nachgetragen (Zeitpunkt vom Benutzer). Bestehende Buchungen gelten als
-- gestempelt, weil sich ihre Herkunft nicht mehr feststellen lässt.
ALTER TABLE bookings
    ADD COLUMN source TEXT NOT NULL DEFAULT 'STAMP'
    CHECK (source IN ('STAMP', 'BACKFILL'));

-- Im Protokoll wird die Herkunft mitgeschrieben, damit Nachtragungen auch
-- nach dem Löschen der Buchung erkennbar bleiben. Ältere Einträge: NULL.
ALTER TABLE booking_changes
    ADD COLUMN source TEXT CHECK (source IN ('STAMP', 'BACKFILL'));
