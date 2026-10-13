export type BookingType = 'KOMMEN' | 'GEHEN' | 'PAUSE_START' | 'PAUSE_ENDE'

export type Booking = {
  id: number
  type: BookingType
  timestamp: string // ISO 8601, z. B. "2026-07-18T23:45"
}

export type NewBooking = Omit<Booking, 'id'>

export type BookingChange = {
  id: number
  bookingId: number
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  oldType: BookingType | null
  oldTimestamp: string | null
  newType: BookingType | null
  newTimestamp: string | null
  changedAt: string
}

export const BOOKING_TYPE_LABELS: Record<BookingType, string> = {
  KOMMEN: 'Kommen',
  PAUSE_START: 'Pause Start',
  PAUSE_ENDE: 'Pause Ende',
  GEHEN: 'Gehen',
}
