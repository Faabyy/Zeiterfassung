import type { Booking, BookingType } from '../types/booking'
import type { BookingStatus } from '../types/bookingStatus'

// Die Prüfung der Buchungsfolge übernimmt das Backend
// (backend/validation.py). Hier wird nur der aktuelle Status abgeleitet.
export function getCurrentBookingStatus(
  bookings: Booking[],
): BookingStatus {
  if (bookings.length === 0) {
    return 'OUT'
  }

  const lastBooking = bookings[bookings.length - 1]

  if (lastBooking.type === 'PAUSE_START') {
    return 'ON_BREAK'
  }

  if (lastBooking.type === 'GEHEN') {
    return 'OUT'
  }

  return 'WORKING'
}

// Welche Buchung im jeweiligen Status als Nächstes erlaubt ist.
export const ALLOWED_NEXT_TYPES: Record<BookingStatus, BookingType[]> = {
  OUT: ['KOMMEN'],
  WORKING: ['PAUSE_START', 'GEHEN'],
  ON_BREAK: ['PAUSE_ENDE'],
}
