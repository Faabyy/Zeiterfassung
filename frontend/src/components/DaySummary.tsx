import { useState } from 'react'
import type { Booking } from '../types/booking'
import type { BookingStatus } from '../types/bookingStatus'
import { getCurrentBookingStatus } from '../utils/bookingStatus'
import type { DayCalculation } from '../utils/calculateDay'
import {
  calculateDays,
  FORGOTTEN_GEHEN_MINUTES,
  MAXIMUM_DAILY_WORK_MINUTES,
  MAXIMUM_WORK_BLOCK_MINUTES,
  MINIMUM_BREAK_BLOCK_MINUTES,
} from '../utils/calculateDay'
import {
  formatDateKey,
  formatDuration,
  formatHours,
  formatTimestamp,
} from '../utils/timeUtils'

type DaySummaryProps = {
  bookings: Booking[]
  now: string // aktuelle Minute, für die laufende Schicht
  selectedDate: string
  onSelectDate: (date: string) => void
}

type SummedField =
  | 'netMinutes'
  | 'saturdayMinutes'
  | 'sundayMinutes'
  | 'holidayMinutes'
  | 'surchargeMinutes'

const STATUS_LABELS: Record<BookingStatus, string> = {
  OUT: 'Nicht eingestempelt',
  WORKING: 'Arbeitet',
  ON_BREAK: 'In Pause',
}

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(year, monthNumber - 1, 1).toLocaleDateString('de-DE', {
    month: 'long',
    year: 'numeric',
  })
}

// Abgeschlossene Tage als CSV (Semikolon, mit BOM für Excel).
function downloadCsv(days: DayCalculation[], fileName: string) {
  const header = [
    'Arbeitstag',
    'Brutto',
    'Pause',
    'Pausenabzug',
    'Netto',
    'Samstag',
    'Sonntag',
    'Feiertag',
    'Zuschlag',
    'Gesamt',
  ]
  const rows = days.map((day) => [
    day.date,
    ...[
      day.workedMinutes,
      day.breakMinutes,
      day.automaticBreakMinutes,
      day.netMinutes,
      day.saturdayMinutes,
      day.sundayMinutes,
      day.holidayMinutes,
      day.surchargeMinutes,
      day.netMinutes + day.surchargeMinutes,
    ].map(formatDuration),
  ])
  const csv = [header, ...rows].map((row) => row.join(';')).join('\r\n')

  const link = document.createElement('a')
  link.href = URL.createObjectURL(
    new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }),
  )
  link.download = fileName
  link.click()
  URL.revokeObjectURL(link.href)
}

function DaySummary({
  bookings,
  now,
  selectedDate,
  onSelectDate,
}: DaySummaryProps) {
  const lastBooking = bookings[bookings.length - 1]
  const currentStatus = getCurrentBookingStatus(bookings)

  // Monat der Auswertung ("2026-10"), leer: alle Monate.
  const [month, setMonth] = useState('')

  const allDays = calculateDays(bookings, now)
  const months = [...new Set(allDays.map((day) => day.date.slice(0, 7)))]
    .sort()
    .reverse()
  const days = allDays.filter((day) => day.date.startsWith(month))
  const closedDays = days.filter((day) => !day.hasOpenWorkSession)

  // Ein Klick auf eine Zeile zeigt die Buchungen dieses Tages in der Liste.
  function rowClassName(date: string, extra = ''): string {
    return ['clickable', date === selectedDate ? 'selected' : '', extra]
      .filter(Boolean)
      .join(' ')
  }

  function sum(field: SummedField): number {
    return days.reduce((total, day) => total + day[field], 0)
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>Tagesübersicht</h2>

        <div className="summary-actions">
          <select
            aria-label="Zeitraum"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          >
            <option value="">Alle Monate</option>
            {months.map((candidate) => (
              <option key={candidate} value={candidate}>
                {formatMonth(candidate)}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="small-button secondary-button"
            disabled={closedDays.length === 0}
            onClick={() =>
              downloadCsv(closedDays, `zeiterfassung-${month || 'alle'}.csv`)
            }
          >
            CSV exportieren
          </button>
        </div>
      </div>

      <div className="summary-tiles">
        <div className="summary-tile">
          <span className="summary-label">Status</span>
          <span className={`status-badge status-${currentStatus}`}>
            {STATUS_LABELS[currentStatus]}
          </span>
          {lastBooking && (
            <span className="summary-detail">
              {currentStatus === 'OUT' ? 'zuletzt' : 'seit'}{' '}
              {formatTimestamp(lastBooking.timestamp)}
            </span>
          )}
        </div>

        <div className="summary-tile">
          <span className="summary-label">Netto inkl. Zuschläge</span>
          <span className="summary-value">
            {formatHours(sum('netMinutes') + sum('surchargeMinutes'))}
          </span>
          <span className="summary-detail">
            Netto {formatHours(sum('netMinutes'))} + Zuschläge{' '}
            {formatHours(sum('surchargeMinutes'))}
            {closedDays.length < days.length && ', inkl. laufender Schicht'}
          </span>
        </div>

        <div className="summary-tile">
          <span className="summary-label">Arbeitstage</span>
          <span className="summary-value">{days.length}</span>
        </div>
      </div>

      {days.length > 0 && (
        <div className="table-wrapper">
          <table className="day-table">
            <thead>
              <tr className="group-row">
                <th></th>
                <th colSpan={4}>Arbeitszeit</th>
                <th colSpan={3} className="group-start">
                  Davon an (Netto)
                </th>
                <th colSpan={2} className="group-start">
                  Mit Zuschlägen
                </th>
              </tr>
              <tr>
                <th>Arbeitstag</th>
                <th>Brutto</th>
                <th>Pause</th>
                <th>Pausenabzug</th>
                <th>Netto</th>
                <th className="group-start">Samstag</th>
                <th>Sonntag</th>
                <th>Feiertag</th>
                <th className="group-start">Zuschlag</th>
                <th>Gesamt</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr
                  key={day.date}
                  className={rowClassName(
                    day.date,
                    day.hasOpenWorkSession ? 'open-day' : '',
                  )}
                  onClick={() => onSelectDate(day.date)}
                >
                  <td>
                    {formatDateKey(day.date)}
                    {day.hasOpenWorkSession && (
                      <>
                        {' '}
                        <span
                          className={`status-badge status-${day.hasOpenBreak ? 'ON_BREAK' : 'WORKING'}`}
                        >
                          {day.hasOpenBreak ? 'Pause' : 'läuft'}
                        </span>
                      </>
                    )}
                  </td>
                  <td>{formatHours(day.workedMinutes)}</td>
                  <td>{formatHours(day.breakMinutes)}</td>
                  <td>{formatHours(day.automaticBreakMinutes)}</td>
                  <td className="net">{formatHours(day.netMinutes)}</td>
                  <td className="group-start">{formatHours(day.saturdayMinutes)}</td>
                  <td>{formatHours(day.sundayMinutes)}</td>
                  <td>{formatHours(day.holidayMinutes)}</td>
                  <td className="group-start">{formatHours(day.surchargeMinutes)}</td>
                  <td className="net">
                    {formatHours(day.netMinutes + day.surchargeMinutes)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Summe</th>
                <td colSpan={3}></td>
                <td className="net">{formatHours(sum('netMinutes'))}</td>
                <td className="group-start">{formatHours(sum('saturdayMinutes'))}</td>
                <td>{formatHours(sum('sundayMinutes'))}</td>
                <td>{formatHours(sum('holidayMinutes'))}</td>
                <td className="group-start">{formatHours(sum('surchargeMinutes'))}</td>
                <td>{formatHours(sum('netMinutes') + sum('surchargeMinutes'))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {days.some((day) => day.hasOpenWorkSession) && (
        <p className="field-note">
          Die laufende Schicht ist bis jetzt gerechnet, als würde jetzt
          gegangen.
        </p>
      )}

      {days
        .filter(
          (day) =>
            day.hasOpenWorkSession && day.workedMinutes > FORGOTTEN_GEHEN_MINUTES,
        )
        .map((day) => (
          <p key={day.date} className="warning">
            {formatDateKey(day.date)}: Die Schicht läuft seit{' '}
            {formatHours(day.workedMinutes)} Std. Wurde „Gehen“ vergessen? Dann
            bitte über „Nachtragen“ nachholen.
          </p>
        ))}

      {days
        .filter((day) => day.netMinutes > MAXIMUM_DAILY_WORK_MINUTES)
        .map((day) => (
          <p key={day.date} className="warning">
            {formatDateKey(day.date)}: {formatHours(day.netMinutes)} Std.
            Arbeitszeit. Nach ArbZG §3 sind höchstens 10 Stunden am Tag erlaubt.
          </p>
        ))}

      {days
        .filter((day) => day.interruptionMinutes > 0)
        .map((day) => (
          <p key={day.date} className="field-note">
            {formatDateKey(day.date)}: Die Unterbrechung von{' '}
            {formatHours(day.interruptionMinutes)} Std. zwischen den Schichten
            zählt als Ruhepause.
          </p>
        ))}

      {days
        .filter((day) => day.ignoredBreakMinutes > 0)
        .map((day) => (
          <p key={day.date} className="warning">
            {formatDateKey(day.date)}: {formatHours(day.ignoredBreakMinutes)} Std.{' '}
            gebuchte Pause wurden nicht angerechnet, da Pausenabschnitte unter{' '}
            {MINIMUM_BREAK_BLOCK_MINUTES} Minuten nach ArbZG §4 nicht als
            Ruhepause gelten. Diese Zeit zählt als Arbeitszeit.
          </p>
        ))}

      {days
        .filter((day) => day.longestWorkBlockMinutes > MAXIMUM_WORK_BLOCK_MINUTES)
        .map((day) => (
          <p key={day.date} className="warning">
            {formatDateKey(day.date)}: Es wurde{' '}
            {formatHours(day.longestWorkBlockMinutes)} Std. am Stück ohne
            Pause gearbeitet. Nach ArbZG §4 sind höchstens 6 Stunden ohne
            Ruhepause erlaubt.
          </p>
        ))}
    </div>
  )
}

export default DaySummary
