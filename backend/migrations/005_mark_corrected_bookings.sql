-- Korrigierte Buchungen werden gekennzeichnet, damit eine gestempelte
-- Buchung nach dem Verschieben nicht weiter als "gestempelt" erscheint.
-- Bestehende Buchungen gelten als unkorrigiert, weil sich das ohne
-- vollständige Historie nicht mehr feststellen lässt.
ALTER TABLE bookings ADD COLUMN corrected BOOLEAN NOT NULL DEFAULT false;
