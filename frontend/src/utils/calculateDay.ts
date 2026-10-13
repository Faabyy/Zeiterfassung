import type { Booking } from '../types/booking'
import {
  HIGH_HOLIDAY_SURCHARGE_RATE,
  HOLIDAY_SURCHARGE_RATE,
  SATURDAY_SURCHARGE_RATE,
  SUNDAY_SURCHARGE_RATE,
  splitMinutesBySurchargeRate,
} from './surcharges'
import { diffInMinutes, toDateKey } from './timeUtils'

// ArbZG §4: Ruhepausen zählen nur in Abschnitten von mindestens 15 Minuten.
export const MINIMUM_BREAK_BLOCK_MINUTES = 15

// ArbZG §4: nicht länger als 6 Stunden am Stück ohne Ruhepause.
export const MAXIMUM_WORK_BLOCK_MINUTES = 6 * 60

export type DayCalculation = {
  date: string // Arbeitstag = Datum der KOMMEN-Buchung (YYYY-MM-DD)
  workedMinutes: number
  breakMinutes: number
  ignoredBreakMinutes: number // Pausen unter 15 min, zählen als Arbeitszeit
  requiredBreakMinutes: number // gesetzliche Pause zur Netto-Arbeitszeit
  automaticBreakMinutes: number
  deductedBreakMinutes: number
  netMinutes: number
  saturdayMinutes: number
  sundayMinutes: number
  holidayMinutes: number
  surchargeMinutes: number
  longestWorkBlockMinutes: number // längste Arbeit am Stück ohne Pause
  hasOpenWorkSession: boolean
  hasOpenBreak: boolean
}

type DayTotals = {
  workedMinutes: number
  breakMinutes: number
  ignoredBreakMinutes: number
  minutesByRate: Map<number, number> // Zuschlagssatz -> Arbeitsminuten
  longestWorkBlockMinutes: number
  hasOpenWorkSession: boolean
  hasOpenBreak: boolean
}

// ArbZG §4: mehr als 6 Stunden Arbeitszeit 30 Minuten Pause,
// mehr als 9 Stunden 45 Minuten.
function getRequiredBreakMinutes(netMinutes: number): number {
  if (netMinutes > 9 * 60) {
    return 45
  }

  if (netMinutes > 6 * 60) {
    return 30
  }

  return 0
}

// Kleinster zusätzlicher Pausenabzug, nach dem die gesetzliche Pause zur
// verbleibenden Arbeitszeit passt. Der Abzug drückt die Arbeitszeit also
// nie unter die Grenze, ab der die Pause erst vorgeschrieben wäre:
// 6:10 h ohne Pause ergeben 6:00 h, nicht 5:40 h.
function getAutomaticBreakMinutes(
  workMinutes: number,
  bookedBreakMinutes: number,
): number {
  let automaticBreakMinutes = 0

  while (
    bookedBreakMinutes + automaticBreakMinutes <
    getRequiredBreakMinutes(workMinutes - automaticBreakMinutes)
  ) {
    automaticBreakMinutes += 1
  }

  return automaticBreakMinutes
}

function createEmptyTotals(): DayTotals {
  return {
    workedMinutes: 0,
    breakMinutes: 0,
    ignoredBreakMinutes: 0,
    minutesByRate: new Map(),
    longestWorkBlockMinutes: 0,
    hasOpenWorkSession: false,
    hasOpenBreak: false,
  }
}

function finishDay(date: string, totals: DayTotals): DayCalculation {
  // Arbeitszeit ohne gebuchte Pausen; zu kurze Pausen zählen mit.
  const workMinutes = totals.workedMinutes - totals.breakMinutes

  const automaticBreakMinutes = getAutomaticBreakMinutes(
    workMinutes,
    totals.breakMinutes,
  )

  const deductedBreakMinutes = totals.breakMinutes + automaticBreakMinutes
  const netMinutes = Math.max(0, workMinutes - automaticBreakMinutes)
  const requiredBreakMinutes = getRequiredBreakMinutes(netMinutes)

  // Gebuchte Pausen sind in den Minuten je Zuschlagssatz bereits
  // herausgerechnet. Die automatische Pause hat keine Lage und wird daher
  // anteilig auf alle Sätze verteilt.
  let actualWorkMinutes = 0

  for (const minutes of totals.minutesByRate.values()) {
    actualWorkMinutes += minutes
  }

  const netFactor = actualWorkMinutes > 0 ? netMinutes / actualWorkMinutes : 0

  function netMinutesAtRate(rate: number): number {
    return Math.round((totals.minutesByRate.get(rate) ?? 0) * netFactor)
  }

  const saturdayMinutes = netMinutesAtRate(SATURDAY_SURCHARGE_RATE)
  const sundayMinutes = netMinutesAtRate(SUNDAY_SURCHARGE_RATE)
  const holidayMinutes125 = netMinutesAtRate(HOLIDAY_SURCHARGE_RATE)
  const holidayMinutes150 = netMinutesAtRate(HIGH_HOLIDAY_SURCHARGE_RATE)

  const surchargeMinutes = Math.round(
    saturdayMinutes * SATURDAY_SURCHARGE_RATE +
      sundayMinutes * SUNDAY_SURCHARGE_RATE +
      holidayMinutes125 * HOLIDAY_SURCHARGE_RATE +
      holidayMinutes150 * HIGH_HOLIDAY_SURCHARGE_RATE,
  )

  return {
    date,
    workedMinutes: totals.workedMinutes,
    breakMinutes: totals.breakMinutes,
    ignoredBreakMinutes: totals.ignoredBreakMinutes,
    requiredBreakMinutes,
    automaticBreakMinutes,
    deductedBreakMinutes,
    netMinutes,
    saturdayMinutes,
    sundayMinutes,
    holidayMinutes: holidayMinutes125 + holidayMinutes150,
    surchargeMinutes,
    longestWorkBlockMinutes: totals.longestWorkBlockMinutes,
    hasOpenWorkSession: totals.hasOpenWorkSession,
    hasOpenBreak: totals.hasOpenBreak,
  }
}

// Erwartet eine chronologisch sortierte, gültige Buchungsfolge.
// Eine Schicht wird vollständig dem Tag ihrer KOMMEN-Buchung zugeordnet,
// auch wenn sie über Mitternacht geht. Zuschläge werden dagegen
// minutengenau nach Kalendertag berechnet.
export function calculateDays(bookings: Booking[]): DayCalculation[] {
  const totalsByDate = new Map<string, DayTotals>()

  let currentDate: string | null = null
  let openWorkStart: string | null = null
  let openBreakStart: string | null = null
  let openSegmentStart: string | null = null
  let pendingSegments: Array<[string, string]> = []
  let pendingBreakMinutes = 0
  let pendingIgnoredBreakMinutes = 0

  for (const booking of bookings) {
    if (booking.type === 'KOMMEN') {
      currentDate = toDateKey(booking.timestamp)
      openWorkStart = booking.timestamp
      openSegmentStart = booking.timestamp
      openBreakStart = null
      pendingSegments = []
      pendingBreakMinutes = 0
      pendingIgnoredBreakMinutes = 0

      if (!totalsByDate.has(currentDate)) {
        totalsByDate.set(currentDate, createEmptyTotals())
      }
    }

    if (booking.type === 'PAUSE_START' && openWorkStart) {
      if (openSegmentStart) {
        pendingSegments.push([openSegmentStart, booking.timestamp])
        openSegmentStart = null
      }

      openBreakStart = booking.timestamp
    }

    if (booking.type === 'PAUSE_ENDE' && openBreakStart) {
      const pauseMinutes = diffInMinutes(openBreakStart, booking.timestamp)

      if (pauseMinutes >= MINIMUM_BREAK_BLOCK_MINUTES) {
        pendingBreakMinutes += pauseMinutes
        openSegmentStart = booking.timestamp
      } else {
        // Zu kurze Pause zählt als Arbeitszeit: Der vor der Pause beendete
        // Arbeitsabschnitt wird einfach fortgesetzt.
        pendingIgnoredBreakMinutes += pauseMinutes
        const resumedSegment = pendingSegments.pop()
        openSegmentStart = resumedSegment
          ? resumedSegment[0]
          : booking.timestamp
      }

      openBreakStart = null
    }

    if (booking.type === 'GEHEN' && openWorkStart && currentDate) {
      if (openSegmentStart) {
        pendingSegments.push([openSegmentStart, booking.timestamp])
      }

      const totals = totalsByDate.get(currentDate)!

      totals.workedMinutes += diffInMinutes(openWorkStart, booking.timestamp)
      totals.breakMinutes += pendingBreakMinutes
      totals.ignoredBreakMinutes += pendingIgnoredBreakMinutes

      // Ein Abschnitt reicht von Arbeitsbeginn bzw. Pausenende bis zur
      // nächsten Pause bzw. bis Gehen; zu kurze Pausen sind schon verbunden.
      for (const [start, end] of pendingSegments) {
        for (const [rate, minutes] of splitMinutesBySurchargeRate(start, end)) {
          totals.minutesByRate.set(
            rate,
            (totals.minutesByRate.get(rate) ?? 0) + minutes,
          )
        }

        totals.longestWorkBlockMinutes = Math.max(
          totals.longestWorkBlockMinutes,
          diffInMinutes(start, end),
        )
      }

      openWorkStart = null
      openBreakStart = null
      openSegmentStart = null
      pendingSegments = []
      pendingBreakMinutes = 0
      pendingIgnoredBreakMinutes = 0
    }
  }

  if (currentDate && openWorkStart) {
    const totals = totalsByDate.get(currentDate)!
    totals.hasOpenWorkSession = true
    totals.hasOpenBreak = openBreakStart !== null
  }

  return [...totalsByDate.entries()]
    .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate))
    .map(([date, totals]) => finishDay(date, totals))
}
