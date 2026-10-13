import type { Booking } from '../types/booking'
import type { BookingStatus } from '../types/bookingStatus'
import { getCurrentBookingStatus } from '../utils/bookingStatus'
import {
  calculateDays,
  MAXIMUM_WORK_BLOCK_MINUTES,
  MINIMUM_BREAK_BLOCK_MINUTES,
} from '../utils/calculateDay'
import {
  formatDateKey,
  formatHours,
  formatTimestamp,
} from '../utils/timeUtils'

type DaySummaryProps = {
  bookings: Booking[]
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

function DaySummary({
  bookings,
  selectedDate,
  onSelectDate,
}: DaySummaryProps) {
  const lastBooking = bookings[bookings.length - 1]
  const currentStatus = getCurrentBookingStatus(bookings)

  const days = calculateDays(bookings)

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
      <h2>Tagesübersicht</h2>

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
          <span className="summary-label">Netto gesamt</span>
          <span className="summary-value">{formatHours(sum('netMinutes'))}</span>
        </div>

        <div className="summary-tile">
          <span className="summary-label">Zuschläge gesamt</span>
          <span className="summary-value">
            {formatHours(sum('surchargeMinutes'))}
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
              <tr>
                <th>Arbeitstag</th>
                <th>Brutto</th>
                <th>Pause</th>
                <th>Pausenabzug</th>
                <th>Netto</th>
                <th>Samstag</th>
                <th>Sonntag</th>
                <th>Feiertag</th>
                <th>Zuschlag</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) =>
                day.hasOpenWorkSession ? (
                  <tr
                    key={day.date}
                    className={rowClassName(day.date, 'open-day')}
                    onClick={() => onSelectDate(day.date)}
                  >
                    <td>
                      {formatDateKey(day.date)}{' '}
                      <span className="status-badge status-WORKING">läuft</span>
                    </td>
                    <td colSpan={8}>Wird nach dem Gehen berechnet</td>
                  </tr>
                ) : (
                  <tr
                    key={day.date}
                    className={rowClassName(day.date)}
                    onClick={() => onSelectDate(day.date)}
                  >
                    <td>{formatDateKey(day.date)}</td>
                    <td>{formatHours(day.workedMinutes)}</td>
                    <td>{formatHours(day.breakMinutes)}</td>
                    <td>{formatHours(day.automaticBreakMinutes)}</td>
                    <td className="net">{formatHours(day.netMinutes)}</td>
                    <td>{formatHours(day.saturdayMinutes)}</td>
                    <td>{formatHours(day.sundayMinutes)}</td>
                    <td>{formatHours(day.holidayMinutes)}</td>
                    <td>{formatHours(day.surchargeMinutes)}</td>
                  </tr>
                ),
              )}
            </tbody>
            <tfoot>
              <tr>
                <th>Summe</th>
                <td colSpan={3}></td>
                <td>{formatHours(sum('netMinutes'))}</td>
                <td>{formatHours(sum('saturdayMinutes'))}</td>
                <td>{formatHours(sum('sundayMinutes'))}</td>
                <td>{formatHours(sum('holidayMinutes'))}</td>
                <td>{formatHours(sum('surchargeMinutes'))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

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
