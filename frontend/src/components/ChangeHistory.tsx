import { BOOKING_TYPE_LABELS } from '../types/booking'
import type { BookingChange, BookingType } from '../types/booking'
import { formatTimestamp } from '../utils/timeUtils'

type ChangeHistoryProps = {
  changes: BookingChange[]
}

const ACTION_LABELS: Record<BookingChange['action'], string> = {
  CREATE: 'Angelegt',
  UPDATE: 'Korrigiert',
  DELETE: 'Gelöscht',
}

function actionLabel(change: BookingChange) {
  return change.action === 'CREATE' && change.source === 'BACKFILL'
    ? 'Nachgetragen'
    : ACTION_LABELS[change.action]
}

function describeBooking(type: BookingType | null, timestamp: string | null) {
  return type && timestamp
    ? `${BOOKING_TYPE_LABELS[type]} ${formatTimestamp(timestamp)}`
    : ''
}

// Die Historie lässt sich nicht leeren, damit Korrekturen nachvollziehbar
// bleiben.
function ChangeHistory({ changes }: ChangeHistoryProps) {
  return (
    <div className="card">
      <h2>Änderungshistorie</h2>

      {changes.length === 0 ? (
        <p>Noch keine Änderungen vorhanden.</p>
      ) : (
        <ul className="list change-list">
          {changes.map((change) => (
            <li key={change.id} className="list-row">
              <span className="muted">
                {new Date(change.changedAt).toLocaleString('de-DE')}
              </span>
              <strong>{actionLabel(change)}</strong>
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
