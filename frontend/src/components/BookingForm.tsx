import React, { useEffect, useState } from 'react'
import { BOOKING_TYPE_LABELS } from '../types/booking'
import type { Booking, BookingType, NewBooking } from '../types/booking'
import {
  ALLOWED_NEXT_TYPES,
  getCurrentBookingStatus,
} from '../utils/bookingStatus'
import {
  addDaysToDateKey,
  formatDateKey,
  parseTimeInput,
  splitTimestamp,
  toLocalTimestamp,
} from '../utils/timeUtils'
import { DateSelect, TimeInput } from './DateTimeInputs'

type FormMode = 'STAMP' | 'PERIOD'
type PeriodType = 'WORK' | 'BREAK'

const BOOKING_TYPES = Object.entries(BOOKING_TYPE_LABELS) as Array<
  [BookingType, string]
>

const INVALID_TIME_MESSAGE = 'Bitte eine gültige Uhrzeit eingeben, z. B. 8:30.'

const PERIOD_BOOKING_TYPES: Record<PeriodType, [BookingType, BookingType]> = {
  WORK: ['KOMMEN', 'GEHEN'],
  BREAK: ['PAUSE_START', 'PAUSE_ENDE'],
}

type BookingFormProps = {
  bookings: Booking[]
  onAddBookings: (newBookings: NewBooking[]) => Promise<boolean>
  bookingToEdit: Booking | null
  onUpdateBooking: (
    id: number,
    type: BookingType,
    timestamp: string,
  ) => Promise<void>
  onCancelEdit: () => void
}

function now() {
  return splitTimestamp(toLocalTimestamp(new Date()))
}

function BookingForm({
  bookings,
  onAddBookings,
  bookingToEdit,
  onUpdateBooking,
  onCancelEdit,
}: BookingFormProps) {
  const [mode, setMode] = useState<FormMode>('STAMP')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  // Stempeln: ohne eigene Zeit wird die aktuelle Uhrzeit verwendet.
  const [useCustomTime, setUseCustomTime] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')

  // Korrektur
  const [editType, setEditType] = useState<BookingType>('KOMMEN')

  // Zeitraum nachtragen
  const [periodType, setPeriodType] = useState<PeriodType>('BREAK')
  const [periodDate, setPeriodDate] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')

  useEffect(() => {
    setError('')

    if (bookingToEdit) {
      const { date, time } = splitTimestamp(bookingToEdit.timestamp)
      setEditType(bookingToEdit.type)
      setDate(date)
      setTime(time)
    }
  }, [bookingToEdit])

  // Mit aktueller Uhrzeit sind nur die im Status erlaubten Buchungen
  // möglich. Bei einer eigenen Zeit prüft das Backend die Reihenfolge.
  const allowedTypes = useCustomTime
    ? BOOKING_TYPES.map(([type]) => type)
    : ALLOWED_NEXT_TYPES[getCurrentBookingStatus(bookings)]

  function changeMode(newMode: FormMode) {
    setMode(newMode)
    setError('')

    if (newMode === 'PERIOD' && periodDate === '') {
      setPeriodDate(now().date)
    }
  }

  function toggleCustomTime() {
    if (!useCustomTime) {
      const current = now()
      setDate(current.date)
      setTime(current.time)
    }

    setUseCustomTime(!useCustomTime)
    setError('')
  }

  async function save(action: () => Promise<unknown>) {
    setIsSaving(true)

    try {
      await action()
    } finally {
      setIsSaving(false)
    }
  }

  function stamp(type: BookingType) {
    const customTime = parseTimeInput(time)

    if (useCustomTime && customTime === null) {
      setError(INVALID_TIME_MESSAGE)
      return
    }

    const timestamp = useCustomTime
      ? `${date}T${customTime}`
      : toLocalTimestamp(new Date())

    setError('')
    save(() => onAddBookings([{ type, timestamp }]))
  }

  // Liegt das Ende vor dem Beginn, endet der Zeitraum am Folgetag.
  const startTime = parseTimeInput(periodStart)
  const endTime = parseTimeInput(periodEnd)
  const periodEndsNextDay =
    startTime !== null && endTime !== null && endTime < startTime

  function submitPeriod() {
    if (startTime === null || endTime === null) {
      setError(INVALID_TIME_MESSAGE)
      return
    }

    if (startTime === endTime) {
      setError('Beginn und Ende dürfen nicht gleich sein.')
      return
    }

    const endDate = periodEndsNextDay
      ? addDaysToDateKey(periodDate, 1)
      : periodDate
    const [startType, endType] = PERIOD_BOOKING_TYPES[periodType]

    setError('')
    save(async () => {
      const added = await onAddBookings([
        { type: startType, timestamp: `${periodDate}T${startTime}` },
        { type: endType, timestamp: `${endDate}T${endTime}` },
      ])

      if (added) {
        setPeriodStart('')
        setPeriodEnd('')
      }
    })
  }

  function submitEdit() {
    if (!bookingToEdit) {
      return
    }

    const editTime = parseTimeInput(time)

    if (editTime === null) {
      setError(INVALID_TIME_MESSAGE)
      return
    }

    setError('')
    save(() =>
      onUpdateBooking(bookingToEdit.id, editType, `${date}T${editTime}`),
    )
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (bookingToEdit) {
      submitEdit()
    } else if (mode === 'PERIOD') {
      submitPeriod()
    }
  }

  const dateTimeFields = (
    <div className="date-time-fields">
      <DateSelect label="Datum" value={date} onChange={setDate} />
      <TimeInput label="Uhrzeit" value={time} onChange={setTime} />
    </div>
  )

  if (bookingToEdit) {
    return (
      <form className="card" onSubmit={handleSubmit}>
        <h2>Buchung korrigieren</h2>

        <label>
          Typ
          <select
            value={editType}
            onChange={(event) =>
              setEditType(event.target.value as BookingType)
            }
          >
            {BOOKING_TYPES.map(([type, label]) => (
              <option key={type} value={type}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {dateTimeFields}

        <div className="form-actions">
          <button type="submit" disabled={isSaving}>
            Korrektur speichern
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={onCancelEdit}
          >
            Abbrechen
          </button>
        </div>

        {error && <p className="error">{error}</p>}
      </form>
    )
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Neue Buchung</h2>

      <div className="mode-switch">
        <button
          type="button"
          aria-pressed={mode === 'STAMP'}
          onClick={() => changeMode('STAMP')}
        >
          Stempeln
        </button>

        <button
          type="button"
          aria-pressed={mode === 'PERIOD'}
          onClick={() => changeMode('PERIOD')}
        >
          Zeitraum nachtragen
        </button>
      </div>

      {mode === 'STAMP' ? (
        <>
          <div className="stamp-buttons">
            {BOOKING_TYPES.map(([type, label]) => (
              <button
                key={type}
                type="button"
                disabled={isSaving || !allowedTypes.includes(type)}
                onClick={() => stamp(type)}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="link-button"
            onClick={toggleCustomTime}
          >
            {useCustomTime
              ? 'Aktuelle Uhrzeit verwenden'
              : 'Andere Zeit eingeben'}
          </button>

          {useCustomTime && dateTimeFields}
        </>
      ) : (
        <>
          <label>
            Art
            <select
              value={periodType}
              onChange={(event) =>
                setPeriodType(event.target.value as PeriodType)
              }
            >
              <option value="BREAK">Pause</option>
              <option value="WORK">Arbeitszeit</option>
            </select>
          </label>

          <div className="date-time-fields">
            <DateSelect
              label="Datum"
              value={periodDate}
              onChange={setPeriodDate}
            />
            <TimeInput
              label="Beginn"
              value={periodStart}
              onChange={setPeriodStart}
            />
            <TimeInput label="Ende" value={periodEnd} onChange={setPeriodEnd} />
          </div>

          {periodEndsNextDay && periodDate !== '' && (
            <p className="field-note">
              Ende am Folgetag ({formatDateKey(addDaysToDateKey(periodDate, 1))})
            </p>
          )}

          <div className="form-actions">
            <button type="submit" disabled={isSaving}>
              Zeitraum hinzufügen
            </button>
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}
    </form>
  )
}

export default BookingForm
