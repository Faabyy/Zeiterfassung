-- Begründung für Nachträge, Korrekturen und Löschungen. Gestempelte
-- Buchungen brauchen keine; ältere Einträge: NULL.
ALTER TABLE booking_changes ADD COLUMN reason TEXT;
