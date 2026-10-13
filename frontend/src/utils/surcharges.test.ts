import { describe, expect, it } from 'vitest'
import { getHolidays, getSurchargeRate } from './surcharges'

describe('Feiertage', () => {
  it('berechnet die beweglichen Feiertage aus Ostern', () => {
    // Ostersonntag 2026 ist der 5. April.
    const holidays = getHolidays(2026)

    expect(holidays.get('2026-04-03')).toBe('Karfreitag')
    expect(holidays.get('2026-04-06')).toBe('Ostermontag')
    expect(holidays.get('2026-05-14')).toBe('Christi Himmelfahrt')
    expect(holidays.get('2026-05-25')).toBe('Pfingstmontag')
  })

  it('stimmt für weitere Jahre', () => {
    expect(getHolidays(2024).get('2024-04-01')).toBe('Ostermontag')
    expect(getHolidays(2025).get('2025-04-18')).toBe('Karfreitag')
    expect(getHolidays(2027).get('2027-05-17')).toBe('Pfingstmontag')
  })

  it('enthält die 9 bundesweiten Feiertage', () => {
    expect(getHolidays(2026).size).toBe(9)
    expect(getHolidays(2026).has('2026-10-03')).toBe(true)
  })
})

describe('Zuschlagssätze', () => {
  const rate = (timestamp: string) => getSurchargeRate(new Date(timestamp))

  it('Werktag, Samstag, Sonntag', () => {
    expect(rate('2026-07-13T10:00')).toBe(0)
    expect(rate('2026-07-18T10:00')).toBe(0.25)
    expect(rate('2026-07-19T10:00')).toBe(0.5)
  })

  it('Feiertage mit 125 %, auch wenn sie auf ein Wochenende fallen', () => {
    expect(rate('2026-04-03T10:00')).toBe(1.25) // Karfreitag
    expect(rate('2026-10-03T10:00')).toBe(1.25) // Samstag
    expect(rate('2023-01-01T10:00')).toBe(1.25) // Sonntag
  })

  it('1. Mai und Weihnachten mit 150 %', () => {
    expect(rate('2026-05-01T10:00')).toBe(1.5)
    expect(rate('2026-12-25T10:00')).toBe(1.5)
    expect(rate('2026-12-26T10:00')).toBe(1.5)
  })

  it('Heiligabend und Silvester erst ab 14 Uhr', () => {
    expect(rate('2026-12-24T13:59')).toBe(0)
    expect(rate('2026-12-24T14:00')).toBe(1.5)
    expect(rate('2026-12-31T13:59')).toBe(0)
    expect(rate('2026-12-31T14:00')).toBe(1.25)
  })
})
