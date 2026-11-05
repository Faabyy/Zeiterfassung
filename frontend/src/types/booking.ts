export type BookingType = 'KOMMEN' | 'GEHEN' | 'PAUSE_START' | 'PAUSE_ENDE'

// STAMP: gestempelt (Zeitpunkt vom Server), BACKFILL: nachgetragen.
export type BookingSource = 'STAMP' | 'BACKFILL'

export type Booking = {
  id: number
  type: BookingType
  timestamp: string // ISO 8601, z. B. "2026-07-18T23:45"
  source: BookingSource
  corrected: boolean // nachträglich über "Bearbeiten" geändert
}

export type NewBooking = Pick<Booking, 'type' | 'timestamp'>

export type BookingChange = {
  id: number
  bookingId: number
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  oldType: BookingType | null
  oldTimestamp: string | null
  newType: BookingType | null
  newTimestamp: string | null
  source: BookingSource | null // null bei Einträgen von vor der Einführung
  reason: string | null // Begründung, fehlt bei gestempelten Buchungen
  changedAt: string
}

export const BOOKING_TYPE_LABELS: Record<BookingType, string> = {
  KOMMEN: 'Kommen',
  PAUSE_START: 'Pause Start',
  PAUSE_ENDE: 'Pause Ende',
  GEHEN: 'Gehen',
}
