export function toDate(timestamp: string): Date {
  return new Date(timestamp)
}

export function diffInMinutes(start: string, end: string): number {
  const startMs = toDate(start).getTime()
  const endMs = toDate(end).getTime()
  return Math.round((endMs - startMs) / 60000)
}

export function formatTimestamp(timestamp: string): string {
  const date = toDate(timestamp)
  return date.toLocaleString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function toDateKey(timestamp: string): string {
  const date = toDate(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// Zeitstempel im Format der Buchungen ("2026-07-18T23:45"), lokale Zeit.
export function toLocalTimestamp(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

// Zerlegt einen Zeitstempel in Datum ("2026-07-18") und Uhrzeit ("23:45").
export function splitTimestamp(timestamp: string): {
  date: string
  time: string
} {
  const [date, time] = timestamp.split('T')
  return { date, time: time.slice(0, 5) }
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  return toLocalTimestamp(new Date(year, month - 1, day + days)).slice(0, 10)
}

// Wertet eine frei eingegebene Uhrzeit aus und liefert sie als "HH:MM".
// Erlaubt sind z. B. "8", "830", "0830", "8:30" und "8.30".
// Liefert null, wenn die Eingabe keine gültige Uhrzeit ist.
export function parseTimeInput(input: string): string | null {
  const text = input.trim()
  const withSeparator = text.match(/^(\d{1,2})[:.](\d{2})$/)
  let hours: string
  let minutes: string

  if (withSeparator) {
    hours = withSeparator[1]
    minutes = withSeparator[2]
  } else if (/^\d{1,2}$/.test(text)) {
    hours = text
    minutes = '00'
  } else if (/^\d{3,4}$/.test(text)) {
    hours = text.slice(0, -2)
    minutes = text.slice(-2)
  } else {
    return null
  }

  if (Number(hours) > 23 || Number(minutes) > 59) {
    return null
  }

  return `${hours.padStart(2, '0')}:${minutes}`
}

// Kompakte Dauer für Tabellen: 510 -> "8:30", 0 -> "–".
export function formatHours(totalMinutes: number): string {
  if (totalMinutes === 0) {
    return '–'
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = String(totalMinutes % 60).padStart(2, '0')
  return `${hours}:${minutes}`
}
