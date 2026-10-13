import { BOOKING_TYPE_LABELS } from '../types/booking'
import type { Booking } from '../types/booking'
import { formatDateKey, splitTimestamp } from '../utils/timeUtils'

type BookingListProps = {
  title: string
  workDay: string // "2026-10-01"
  bookings: Booking[]
  onEditBooking: (booking: Booking) => void
  onDeleteBooking: (id: number) => void
  onShowToday?: () => void
}

function BookingList({
  title,
  workDay,
  bookings,
  onEditBooking,
  onDeleteBooking,
  onShowToday,
}: BookingListProps) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>{title}</h2>

        {onShowToday && (
          <button type="button" className="link-button" onClick={onShowToday}>
            Zurück zu heute
          </button>
        )}
      </div>

      {bookings.length === 0 ? (
        <p className="muted">Keine Buchungen an diesem Tag.</p>
      ) : (
        <ul className="list booking-list">
          {bookings.map((booking) => {
            const { date, time } = splitTimestamp(booking.timestamp)

            return (
              <li key={booking.id} className="list-row">
                <span className="booking-time">
                  {time}
                  {/* Nachtschicht: Buchung liegt schon am Folgetag */}
                  {date !== workDay && (
                    <span className="muted"> {formatDateKey(date)}</span>
                  )}
                </span>

                <span>{BOOKING_TYPE_LABELS[booking.type]}</span>

                <span className="row-actions">
                  <button
                    type="button"
                    className="small-button secondary-button"
                    onClick={() => onEditBooking(booking)}
                  >
                    Bearbeiten
                  </button>

                  <button
                    type="button"
                    className="small-button delete-button"
                    onClick={() => onDeleteBooking(booking.id)}
                  >
                    Löschen
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default BookingList
