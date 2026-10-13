import { BOOKING_TYPE_LABELS } from '../types/booking'
import type { BookingChange, BookingType } from '../types/booking'
import { formatTimestamp } from '../utils/timeUtils'

type ChangeHistoryProps = {
  changes: BookingChange[]
  onClear: () => void
}

const ACTION_LABELS: Record<BookingChange['action'], string> = {
  CREATE: 'Angelegt',
  UPDATE: 'Korrigiert',
  DELETE: 'Gelöscht',
}

function describeBooking(type: BookingType | null, timestamp: string | null) {
  return type && timestamp
    ? `${BOOKING_TYPE_LABELS[type]} ${formatTimestamp(timestamp)}`
    : ''
}

function ChangeHistory({ changes, onClear }: ChangeHistoryProps) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>Änderungshistorie</h2>

        {changes.length > 0 && (
          <button type="button" className="link-button quiet" onClick={onClear}>
            Leeren
          </button>
        )}
      </div>

      {changes.length === 0 ? (
        <p>Noch keine Änderungen vorhanden.</p>
      ) : (
        <ul className="list change-list">
          {changes.map((change) => (
            <li key={change.id} className="list-row">
              <span className="muted">
                {new Date(change.changedAt).toLocaleString('de-DE')}
              </span>
              <strong>{ACTION_LABELS[change.action]}</strong>
              <span>
                {change.action === 'UPDATE'
                  ? `${describeBooking(change.oldType, change.oldTimestamp)} → ` +
                    describeBooking(change.newType, change.newTimestamp)
                  : describeBooking(
                      change.newType ?? change.oldType,
                      change.newTimestamp ?? change.oldTimestamp,
                    )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default ChangeHistory
