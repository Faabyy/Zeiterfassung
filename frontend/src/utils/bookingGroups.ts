import type { Booking } from '../types/booking'
import { toDateKey } from './timeUtils'

// Entspricht backend/booking_groups.py: Liefert die Buchungen, die beim
// Löschen mit entfernt werden, damit die Folge gültig bleibt.
// - KOMMEN oder GEHEN: die ganze Schicht inklusive ihrer Pausen
// - PAUSE_START oder PAUSE_ENDE: das Pausenpaar
export function findBookingGroup(
  bookings: Booking[],
  bookingId: number,
): Booking[] {
  const shiftById = new Map<number, Booking[]>()
  const pauseById = new Map<number, Booking[]>()

  let shift: Booking[] = []
  let pause: Booking[] = []

  for (const booking of bookings) {
    shift.push(booking)

    if (booking.type === 'PAUSE_START') {
      pause = [booking]
    }

    if (booking.type === 'PAUSE_ENDE') {
      pause.push(booking)
      pause.forEach((pauseBooking) => pauseById.set(pauseBooking.id, pause))
      pause = []
    }

    if (booking.type === 'GEHEN') {
      shift.forEach((shiftBooking) => shiftById.set(shiftBooking.id, shift))
      shift = []
    }
  }

  shift.forEach((shiftBooking) => shiftById.set(shiftBooking.id, shift))
  pause.forEach((pauseBooking) => pauseById.set(pauseBooking.id, pause))

  const booking = bookings.find((candidate) => candidate.id === bookingId)

  if (!booking) {
    return []
  }

  if (booking.type === 'KOMMEN' || booking.type === 'GEHEN') {
    return shiftById.get(bookingId) ?? [booking]
  }

  return pauseById.get(bookingId) ?? [booking]
}

// Ordnet jede Buchung ihrem Arbeitstag zu (Datum der KOMMEN-Buchung ihrer
// Schicht), wie in der Tagesübersicht. Erwartet eine sortierte Folge.
export function filterBookingsByWorkDay(
  bookings: Booking[],
  dateKey: string,
): Booking[] {
  let workDay: string | null = null

  return bookings.filter((booking) => {
    if (booking.type === 'KOMMEN') {
      workDay = toDateKey(booking.timestamp)
    }

    return workDay === dateKey
  })
}
