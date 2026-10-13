import {
  addDaysToDateKey,
  formatDateKey,
  parseTimeInput,
  toLocalTimestamp,
} from '../utils/timeUtils'

const SELECTABLE_DAYS = 31

const DAY_LABELS = ['heute', 'gestern', 'vorgestern']

type DateSelectProps = {
  label: string
  value: string // "2026-10-01"
  onChange: (value: string) => void
}

// Auswahl der letzten 31 Tage, neuester zuerst. Ein älteres Datum
// (z. B. beim Korrigieren) wird zusätzlich angeboten.
export function DateSelect({ label, value, onChange }: DateSelectProps) {
  const today = toLocalTimestamp(new Date()).slice(0, 10)
  const dates = Array.from({ length: SELECTABLE_DAYS }, (_, index) =>
    addDaysToDateKey(today, -index),
  )

  if (value && !dates.includes(value)) {
    dates.push(value)
  }

  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {dates.map((date, index) => (
          <option key={date} value={date}>
            {formatDateKey(date)}
            {DAY_LABELS[index] ? ` (${DAY_LABELS[index]})` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}

type TimeInputProps = {
  label: string
  value: string // freie Eingabe, z. B. "830"
  onChange: (value: string) => void
}

// Freies Textfeld für die Uhrzeit; beim Verlassen wird die Eingabe
// zu "HH:MM" vereinheitlicht, sofern sie gültig ist.
export function TimeInput({ label, value, onChange }: TimeInputProps) {
  return (
    <label>
      {label}
      <input
        type="text"
        inputMode="numeric"
        placeholder="z. B. 8:30"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => onChange(parseTimeInput(value) ?? value)}
      />
    </label>
  )
}
