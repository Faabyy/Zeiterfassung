import { describe, expect, it } from 'vitest'
import type { Booking, BookingType } from '../types/booking'
import { filterBookingsByWorkDay, findOpenShift } from './bookingGroups'

function bookingsOf(...entries: Array<[BookingType, string]>): Booking[] {
  return entries.map(([type, timestamp], index) => ({
    id: index + 1,
    type,
    timestamp,
    source: 'STAMP',
    corrected: false,
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

describe('findOpenShift', () => {
  it('liefert die laufende Schicht, auch wenn sie gestern begann', () => {
    const bookings = bookingsOf(
      ['KOMMEN', '2026-09-30T08:00'],
      ['GEHEN', '2026-09-30T16:00'],
      ['KOMMEN', '2026-09-30T22:00'],
      ['PAUSE_START', '2026-10-01T01:00'],
    )

    expect(findOpenShift(bookings).map((booking) => booking.id)).toEqual([3, 4])
  })

  it('ist leer, wenn niemand eingestempelt ist', () => {
    const bookings = bookingsOf(
      ['KOMMEN', '2026-09-30T08:00'],
      ['GEHEN', '2026-09-30T16:00'],
    )

    expect(findOpenShift(bookings)).toEqual([])
    expect(findOpenShift([])).toEqual([])
  })
})
