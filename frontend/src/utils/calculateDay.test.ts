import { describe, expect, it } from 'vitest'
import type { Booking, BookingType } from '../types/booking'
import { calculateDays } from './calculateDay'

// Kalenderwoche ohne Zeitumstellung: Mo 13.07.2026 bis So 19.07.2026.
function bookingsOf(...entries: Array<[BookingType, string]>): Booking[] {
  return entries.map(([type, timestamp], index) => ({
    id: index + 1,
    type,
    timestamp,
  }))
}

function calculateSingleDay(...entries: Array<[BookingType, string]>) {
  const days = calculateDays(bookingsOf(...entries))
  expect(days).toHaveLength(1)
  return days[0]
}

describe('Pausen', () => {
  it('zieht eine ausreichend gebuchte Pause ab', () => {
    const day = calculateSingleDay(
      ['KOMMEN', '2026-07-13T08:00'],
      ['PAUSE_START', '2026-07-13T12:00'],
      ['PAUSE_ENDE', '2026-07-13T12:30'],
      ['GEHEN', '2026-07-13T16:30'],
    )

    expect(day).toMatchObject({
      date: '2026-07-13',
      workedMinutes: 510,
      breakMinutes: 30,
      requiredBreakMinutes: 30,
      automaticBreakMinutes: 0,
      netMinutes: 480,
    })
  })

  it('braucht bis einschließlich 6 Stunden keine Pause', () => {
    const day = calculateSingleDay(
      ['KOMMEN', '2026-07-13T08:00'],
      ['GEHEN', '2026-07-13T14:00'],
    )

    expect(day).toMatchObject({
      requiredBreakMinutes: 0,
      automaticBreakMinutes: 0,
      netMinutes: 360,
    })
  })

  it('ergänzt fehlende Pause über 6 Stunden automatisch', () => {
    const day = calculateSingleDay(
      ['KOMMEN', '2026-07-13T08:00'],
      ['GEHEN', '2026-07-13T16:00'],
    )

    expect(day).toMatchObject({
      workedMinutes: 480,
      requiredBreakMinutes: 30,
      automaticBreakMinutes: 30,
      deductedBreakMinutes: 30,
      netMinutes: 450,
    })
  })

  it('ergänzt über 9 Stunden auf 45 Minuten', () => {
    const day = calculateSingleDay(
      ['KOMMEN', '2026-07-13T07:00'],
      ['PAUSE_START', '2026-07-13T12:00'],
      ['PAUSE_ENDE', '2026-07-13T12:30'],
      ['GEHEN', '2026-07-13T17:00'],
    )

    expect(day).toMatchObject({
      workedMinutes: 600,
      breakMinutes: 30,
      requiredBreakMinutes: 45,
      automaticBreakMinutes: 15,
      deductedBreakMinutes: 45,
      netMinutes: 555,
    })
  })

  it('drückt die Arbeitszeit nicht unter 6 Stunden', () => {
    const day = calculateSingleDay(
      ['KOMMEN', '2026-07-13T08:00'],
      ['GEHEN', '2026-07-13T14:10'],
    )

    expect(day).toMatchObject({
      workedMinutes: 370,
      automaticBreakMinutes: 10,
      netMinutes: 360,
      requiredBreakMinutes: 0,
    })
  })

  it('ergänzt eine zu kurze gebuchte Pause nur bis zur 6-Stunden-Grenze', () => {
    const day = calculateSingleDay(
      ['KOMMEN', '2026-07-13T08:00'],
      ['PAUSE_START', '2026-07-13T12:00'],
      ['PAUSE_ENDE', '2026-07-13T12:15'],
      ['GEHEN', '2026-07-13T14:20'],
    )

    expect(day).toMatchObject({
      workedMinutes: 380,
      breakMinutes: 15,
      automaticBreakMinutes: 5,
      deductedBreakMinutes: 20,
      netMinutes: 360,
    })
  })

  it('zieht knapp über 9 Stunden ohne Pause nur 30 Minuten ab', () => {
    // 9:10 h minus 30 min ergibt 8:40 h, dafür reichen 30 min Pause.
    const day = calculateSingleDay(
      ['KOMMEN', '2026-07-13T07:00'],
      ['GEHEN', '2026-07-13T16:10'],
    )

    expect(day).toMatchObject({
      workedMinutes: 550,
      automaticBreakMinutes: 30,
      netMinutes: 520,
      requiredBreakMinutes: 30,
    })
  })

  it('drückt die Arbeitszeit nicht unter 9 Stunden', () => {
    // 9:40 h: mit 30 min blieben 9:10 h, das verlangt 45 min.
    // Mit 40 min bleiben genau 9:00 h, dafür reichen 30 min.
    const day = calculateSingleDay(
      ['KOMMEN', '2026-07-13T07:00'],
      ['GEHEN', '2026-07-13T16:40'],
    )

    expect(day).toMatchObject({
      workedMinutes: 580,
      automaticBreakMinutes: 40,
      netMinutes: 540,
    })
  })

  it('zieht weit über 9 Stunden ohne Pause 45 Minuten ab', () => {
    const day = calculateSingleDay(
      ['KOMMEN', '2026-07-13T07:00'],
      ['GEHEN', '2026-07-13T18:00'],
    )

    expect(day).toMatchObject({
      workedMinutes: 660,
      automaticBreakMinutes: 45,
      netMinutes: 615,
      requiredBreakMinutes: 45,
    })
  })

  it('rechnet Pausen unter 15 Minuten als Arbeitszeit', () => {
    const day = calculateSingleDay(
      ['KOMMEN', '2026-07-13T08:00'],
      ['PAUSE_START', '2026-07-13T10:00'],
      ['PAUSE_ENDE', '2026-07-13T10:10'],
      ['GEHEN', '2026-07-13T12:00'],
    )

    expect(day).toMatchObject({
      breakMinutes: 0,
      ignoredBreakMinutes: 10,
      netMinutes: 240,
    })
  })

  it('erkennt eine Pause von genau 15 Minuten an', () => {
    const day = calculateSingleDay(
      ['KOMMEN', '2026-07-13T08:00'],
      ['PAUSE_START', '2026-07-13T10:00'],
      ['PAUSE_ENDE', '2026-07-13T10:15'],
      ['GEHEN', '2026-07-13T12:00'],
    )

    expect(day).toMatchObject({
      breakMinutes: 15,
      ignoredBreakMinutes: 0,
      netMinutes: 225,
    })
  })
})

describe('Wochenendzuschläge', () => {
  it('berechnet 25 % am Samstag', () => {
    const day = calculateSingleDay(
      ['KOMMEN', '2026-07-18T08:00'],
      ['GEHEN', '2026-07-18T12:00'],
    )

    expect(day).toMatchObject({
      saturdayMinutes: 240,
      sundayMinutes: 0,
      surchargeMinutes: 60,
    })
  })

  it('berechnet 50 % am Sonntag', () => {
    const day = calculateSingleDay(
      ['KOMMEN', '2026-07-19T08:00'],
      ['GEHEN', '2026-07-19T12:00'],
    )

    expect(day).toMatchObject({
      saturdayMinutes: 0,
      sundayMinutes: 240,
      surchargeMinutes: 120,
    })
  })

  it('teilt eine Schicht über Mitternacht minutengenau auf', () => {
    const day = calculateSingleDay(
      ['KOMMEN', '2026-07-18T22:00'],
      ['GEHEN', '2026-07-19T04:00'],
    )

    expect(day).toMatchObject({
      date: '2026-07-18',
      netMinutes: 360,
      saturdayMinutes: 120,
      sundayMinutes: 240,
      surchargeMinutes: 150,
    })
  })

  it('rechnet gebuchte Pausen aus den Zuschlagsminuten heraus', () => {
    const day = calculateSingleDay(
      ['KOMMEN', '2026-07-17T22:00'],
      ['PAUSE_START', '2026-07-18T02:00'],
      ['PAUSE_ENDE', '2026-07-18T02:30'],
      ['GEHEN', '2026-07-18T06:30'],
    )

    expect(day).toMatchObject({
      date: '2026-07-17',
      netMinutes: 480,
      saturdayMinutes: 360,
      surchargeMinutes: 90,
    })
  })

  it('verteilt die automatische Pause anteilig auf die Wochentage', () => {
    // 8 h ohne Pause, je 4 h Samstag und Sonntag: 30 min Abzug, je 15 min.
    const day = calculateSingleDay(
      ['KOMMEN', '2026-07-18T20:00'],
      ['GEHEN', '2026-07-19T04:00'],
    )

    expect(day).toMatchObject({
      automaticBreakMinutes: 30,
      netMinutes: 450,
      saturdayMinutes: 225,
      sundayMinutes: 225,
      surchargeMinutes: Math.round(225 * 0.25 + 225 * 0.5),
    })
  })
})

describe('Feiertagszuschläge', () => {
  it('berechnet 125 % an Feiertagen', () => {
    const day = calculateSingleDay(
      ['KOMMEN', '2026-04-03T08:00'],
      ['GEHEN', '2026-04-03T12:00'],
    )

    expect(day).toMatchObject({
      holidayMinutes: 240,
      surchargeMinutes: 300,
    })
  })

  it('berechnet 150 % am 1. Mai', () => {
    const day = calculateSingleDay(
      ['KOMMEN', '2026-05-01T08:00'],
      ['GEHEN', '2026-05-01T12:00'],
    )

    expect(day).toMatchObject({
      holidayMinutes: 240,
      surchargeMinutes: 360,
    })
  })

  it('berechnet Heiligabend erst ab 14 Uhr', () => {
    const day = calculateSingleDay(
      ['KOMMEN', '2026-12-24T12:00'],
      ['GEHEN', '2026-12-24T16:00'],
    )

    expect(day).toMatchObject({
      holidayMinutes: 120,
      surchargeMinutes: 180,
    })
  })
})

describe('Arbeit am Stück', () => {
  it('erkennt mehr als 6 Stunden ohne Pause', () => {
    const day = calculateSingleDay(
      ['KOMMEN', '2026-07-13T08:00'],
      ['GEHEN', '2026-07-13T15:00'],
    )

    expect(day.longestWorkBlockMinutes).toBe(420)
  })

  it('teilt den Arbeitsblock an einer Pause', () => {
    const day = calculateSingleDay(
      ['KOMMEN', '2026-07-13T08:00'],
      ['PAUSE_START', '2026-07-13T12:00'],
      ['PAUSE_ENDE', '2026-07-13T12:30'],
      ['GEHEN', '2026-07-13T15:30'],
    )

    expect(day.longestWorkBlockMinutes).toBe(240)
  })

  it('wertet Pausen unter 15 Minuten nicht als Unterbrechung', () => {
    const day = calculateSingleDay(
      ['KOMMEN', '2026-07-13T08:00'],
      ['PAUSE_START', '2026-07-13T11:00'],
      ['PAUSE_ENDE', '2026-07-13T11:10'],
      ['GEHEN', '2026-07-13T15:00'],
    )

    expect(day.longestWorkBlockMinutes).toBe(420)
  })
})

describe('Tage und offene Buchungen', () => {
  it('liefert je Arbeitstag einen Eintrag in Datumsreihenfolge', () => {
    const days = calculateDays(
      bookingsOf(
        ['KOMMEN', '2026-07-13T08:00'],
        ['GEHEN', '2026-07-13T12:00'],
        ['KOMMEN', '2026-07-14T08:00'],
        ['GEHEN', '2026-07-14T10:00'],
      ),
    )

    expect(days.map((day) => [day.date, day.netMinutes])).toEqual([
      ['2026-07-13', 240],
      ['2026-07-14', 120],
    ])
  })

  it('markiert eine offene Schicht', () => {
    const day = calculateSingleDay(['KOMMEN', '2026-07-13T08:00'])

    expect(day).toMatchObject({
      hasOpenWorkSession: true,
      hasOpenBreak: false,
      workedMinutes: 0,
    })
  })

  it('markiert eine offene Pause', () => {
    const day = calculateSingleDay(
      ['KOMMEN', '2026-07-13T08:00'],
      ['PAUSE_START', '2026-07-13T12:00'],
    )

    expect(day).toMatchObject({
      hasOpenWorkSession: true,
      hasOpenBreak: true,
    })
  })

  it('liefert für keine Buchungen keine Tage', () => {
    expect(calculateDays([])).toEqual([])
  })
})
