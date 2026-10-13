import { toDate } from './timeUtils'

// Zuschlagssätze. Samstag und Sonntag laut Anforderung, Feiertage nach den
// steuerfreien Höchstsätzen aus §3b EStG.
export const SATURDAY_SURCHARGE_RATE = 0.25
export const SUNDAY_SURCHARGE_RATE = 0.5
export const HOLIDAY_SURCHARGE_RATE = 1.25
export const HIGH_HOLIDAY_SURCHARGE_RATE = 1.5

// Ostersonntag nach der Gaußschen Osterformel (gregorianischer Kalender).
function getEasterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1

  return new Date(year, month - 1, day)
}

function toLocalDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

const holidaysByYear = new Map<number, Map<string, string>>()

// Bundesweite gesetzliche Feiertage eines Jahres (Datum -> Name).
export function getHolidays(year: number): Map<string, string> {
  const cached = holidaysByYear.get(year)

  if (cached) {
    return cached
  }

  const easter = getEasterSunday(year)
  const holidays: Array<[Date, string]> = [
    [new Date(year, 0, 1), 'Neujahr'],
    [addDays(easter, -2), 'Karfreitag'],
    [addDays(easter, 1), 'Ostermontag'],
    [new Date(year, 4, 1), 'Tag der Arbeit'],
    [addDays(easter, 39), 'Christi Himmelfahrt'],
    [addDays(easter, 50), 'Pfingstmontag'],
    [new Date(year, 9, 3), 'Tag der Deutschen Einheit'],
    [new Date(year, 11, 25), '1. Weihnachtstag'],
    [new Date(year, 11, 26), '2. Weihnachtstag'],
  ]

  const result = new Map(
    holidays.map(([date, name]) => [toLocalDateKey(date), name]),
  )

  holidaysByYear.set(year, result)
  return result
}

// Zuschlagssatz für die Arbeitsminute, die zu diesem Zeitpunkt beginnt.
// Gibt es mehrere Gründe (z. B. Feiertag am Sonntag), gilt der höchste Satz.
export function getSurchargeRate(date: Date): number {
  const month = date.getMonth() + 1
  const day = date.getDate()
  const afternoon = date.getHours() >= 14

  if (
    (month === 5 && day === 1) ||
    (month === 12 && (day === 25 || day === 26)) ||
    (month === 12 && day === 24 && afternoon)
  ) {
    return HIGH_HOLIDAY_SURCHARGE_RATE
  }

  if (
    getHolidays(date.getFullYear()).has(toLocalDateKey(date)) ||
    (month === 12 && day === 31 && afternoon)
  ) {
    return HOLIDAY_SURCHARGE_RATE
  }

  if (date.getDay() === 0) {
    return SUNDAY_SURCHARGE_RATE
  }

  if (date.getDay() === 6) {
    return SATURDAY_SURCHARGE_RATE
  }

  return 0
}

// Teilt einen Zeitraum minutengenau nach Zuschlagssatz auf
// (Satz -> Anzahl Minuten), z. B. Sa 22:00 bis So 04:00.
export function splitMinutesBySurchargeRate(
  start: string,
  end: string,
): Map<number, number> {
  const minutesByRate = new Map<number, number>()
  const endTime = toDate(end).getTime()

  for (
    let time = toDate(start).getTime();
    time < endTime;
    time += 60 * 1000
  ) {
    const rate = getSurchargeRate(new Date(time))
    minutesByRate.set(rate, (minutesByRate.get(rate) ?? 0) + 1)
  }

  return minutesByRate
}
