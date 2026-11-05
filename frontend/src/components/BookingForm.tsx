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
import {
  DateSelect,
  MISSING_REASON_MESSAGE,
  ReasonInput,
  TimeInput,
} from './DateTimeInputs'

type FormMode = 'STAMP' | 'BACKFILL'
type PeriodType = 'WORK' | 'BREAK'

// Nachgetragen wird entweder ein Zeitraum (zwei Buchungen) oder eine
// einzelne Buchung.
type BackfillType = PeriodType | BookingType

const BOOKING_TYPES = Object.entries(BOOKING_TYPE_LABELS) as Array<
  [BookingType, string]
>

const INVALID_TIME_MESSAGE = 'Bitte eine gültige Uhrzeit eingeben, z. B. 8:30.'

const PERIOD_BOOKING_TYPES: Record<PeriodType, [BookingType, BookingType]> = {
  WORK: ['KOMMEN', 'GEHEN'],
  BREAK: ['PAUSE_START', 'PAUSE_ENDE'],
}

function isPeriodType(type: BackfillType): type is PeriodType {
  return type in PERIOD_BOOKING_TYPES
}

type BookingFormProps = {
  bookings: Booking[]
  onStamp: (type: BookingType) => Promise<void>
  onBackfill: (newBookings: NewBooking[], reason: string) => Promise<boolean>
  bookingToEdit: Booking | null
  onUpdateBooking: (
    id: number,
    type: BookingType,
    timestamp: string,
    reason: string,
  ) => Promise<void>
  onCancelEdit: () => void
}

function today() {
  return toLocalTimestamp(new Date()).slice(0, 10)
}

function BookingForm({
  bookings,
  onStamp,
  onBackfill,
  bookingToEdit,
  onUpdateBooking,
  onCancelEdit,
}: BookingFormProps) {
  const [mode, setMode] = useState<FormMode>('STAMP')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  // Korrektur
  const [editType, setEditType] = useState<BookingType>('KOMMEN')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [editReason, setEditReason] = useState('')

  // Nachtragen
  const [backfillType, setBackfillType] = useState<BackfillType>('BREAK')
  const [backfillDate, setBackfillDate] = useState('')
  const [backfillStart, setBackfillStart] = useState('')
  const [backfillEnd, setBackfillEnd] = useState('')
  const [backfillReason, setBackfillReason] = useState('')

  useEffect(() => {
    setError('')

    if (bookingToEdit) {
      const { date, time } = splitTimestamp(bookingToEdit.timestamp)
      setEditType(bookingToEdit.type)
      setDate(date)
      setTime(time)
      setEditReason('')
    }
  }, [bookingToEdit])

  // Gestempelt wird immer zur aktuellen Uhrzeit, daher sind nur die im
  // aktuellen Status erlaubten Buchungen möglich.
  const allowedTypes = ALLOWED_NEXT_TYPES[getCurrentBookingStatus(bookings)]

  function changeMode(newMode: FormMode) {
    setMode(newMode)
    setError('')

    if (newMode === 'BACKFILL' && backfillDate === '') {
      setBackfillDate(today())
    }
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
    setError('')
    save(() => onStamp(type))
  }

  // Bei einem Zeitraum endet er am Folgetag, wenn das Ende vor dem Beginn liegt.
  const isPeriod = isPeriodType(backfillType)
  const startTime = parseTimeInput(backfillStart)
  const endTime = parseTimeInput(backfillEnd)
  const periodEndsNextDay =
    isPeriod && startTime !== null && endTime !== null && endTime < startTime

  function buildBackfillBookings(): NewBooking[] | null {
    if (startTime === null || (isPeriod && endTime === null)) {
      setError(INVALID_TIME_MESSAGE)
      return null
    }

    if (!isPeriodType(backfillType)) {
      return [
        { type: backfillType, timestamp: `${backfillDate}T${startTime}` },
      ]
    }

    if (startTime === endTime) {
      setError('Beginn und Ende dürfen nicht gleich sein.')
      return null
    }

    const endDate = periodEndsNextDay
      ? addDaysToDateKey(backfillDate, 1)
      : backfillDate
    const [startType, endType] = PERIOD_BOOKING_TYPES[backfillType]

    return [
      { type: startType, timestamp: `${backfillDate}T${startTime}` },
      { type: endType, timestamp: `${endDate}T${endTime}` },
    ]
  }

  function submitBackfill() {
    const newBookings = buildBackfillBookings()

    if (newBookings === null) {
      return
    }

    if (backfillReason.trim() === '') {
      setError(MISSING_REASON_MESSAGE)
      return
    }

    setError('')
    save(async () => {
      const added = await onBackfill(newBookings, backfillReason.trim())

      if (added) {
        setBackfillStart('')
        setBackfillEnd('')
        setBackfillReason('')
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

    if (editReason.trim() === '') {
      setError(MISSING_REASON_MESSAGE)
      return
    }

    setError('')
    save(() =>
      onUpdateBooking(
        bookingToEdit.id,
        editType,
        `${date}T${editTime}`,
        editReason.trim(),
      ),
    )
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (bookingToEdit) {
      submitEdit()
    } else if (mode === 'BACKFILL') {
      submitBackfill()
    }
  }

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

        <div className="date-time-fields">
          <DateSelect label="Datum" value={date} onChange={setDate} />
          <TimeInput label="Uhrzeit" value={time} onChange={setTime} />
        </div>

        <ReasonInput value={editReason} onChange={setEditReason} />

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
          aria-pressed={mode === 'BACKFILL'}
          onClick={() => changeMode('BACKFILL')}
        >
          Nachtragen
        </button>
      </div>

      {mode === 'STAMP' ? (
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
      ) : (
        <>
          <label>
            Art
            <select
              value={backfillType}
              onChange={(event) =>
                setBackfillType(event.target.value as BackfillType)
              }
            >
              <optgroup label="Zeitraum">
                <option value="BREAK">Pause</option>
                <option value="WORK">Arbeitszeit</option>
              </optgroup>
              <optgroup label="Einzelbuchung">
                {BOOKING_TYPES.map(([type, label]) => (
                  <option key={type} value={type}>
                    {label}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <div className="date-time-fields">
            <DateSelect
              label="Datum"
              value={backfillDate}
              onChange={setBackfillDate}
            />
            <TimeInput
              label={isPeriod ? 'Beginn' : 'Uhrzeit'}
              value={backfillStart}
              onChange={setBackfillStart}
            />
            {isPeriod && (
              <TimeInput
                label="Ende"
                value={backfillEnd}
                onChange={setBackfillEnd}
              />
            )}
          </div>

          {periodEndsNextDay && backfillDate !== '' && (
            <p className="field-note">
              Ende am Folgetag ({formatDateKey(addDaysToDateKey(backfillDate, 1))})
            </p>
          )}

          <ReasonInput value={backfillReason} onChange={setBackfillReason} />

          <div className="form-actions">
            <button type="submit" disabled={isSaving}>
              Nachtragen
            </button>
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}
    </form>
  )
}

export default BookingForm
