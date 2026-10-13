import { describe, expect, it } from 'vitest'
import type { Booking, BookingType } from '../types/booking'
import { filterBookingsByWorkDay } from './bookingGroups'

function bookingsOf(...entries: Array<[BookingType, string]>): Booking[] {
  return entries.map(([type, timestamp], index) => ({
    id: index + 1,
    type,
    timestamp,
  }))
}

describe('filterBookingsByWorkDay', () => {
  const bookings = bookingsOf(
    ['KOMMEN', '2026-09-30T22:00'],
    ['GEHEN', '2026-10-01T06:00'],
    ['KOMMEN', '2026-10-01T18:00'],
    ['PAUSE_START', '2026-10-01T20:00'],
  )

  it('ordnet eine Nachtschicht ihrem Starttag zu', () => {
    expect(filterBookingsByWorkDay(bookings, '2026-09-30').map((b) => b.id))
      .toEqual([1, 2])
  })

  it('liefert die Buchungen des Tages', () => {
    expect(filterBookingsByWorkDay(bookings, '2026-10-01').map((b) => b.id))
      .toEqual([3, 4])
  })

  it('liefert für einen Tag ohne Schicht nichts', () => {
    expect(filterBookingsByWorkDay(bookings, '2026-10-02')).toEqual([])
  })
})
