import type {
  Booking,
  BookingChange,
  BookingSource,
  BookingType,
  NewBooking,
} from '../types/booking'

const BASE_URL = '/api/bookings'

export class ApiError extends Error {}

// Nicht (mehr) angemeldet, z. B. nach dem Abmelden in einem anderen Tab.
export class UnauthorizedError extends ApiError {}

const BACKEND_UNREACHABLE = 'Das Backend ist nicht erreichbar. Läuft es?'

// FastAPI liefert Regelverletzungen als Text in "detail",
// Formatfehler (422) als Liste von Fehlerobjekten. Ist das Backend nicht
// erreichbar, antwortet der Vite-Proxy mit 502 (siehe vite.config.ts).
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json()

    if (typeof body.detail === 'string') {
      return body.detail
    }

    if (Array.isArray(body.detail)) {
      return body.detail.map((error: { msg: string }) => error.msg).join(' ')
    }
  } catch {
    // Kein JSON, z. B. bei einem unerwarteten Fehler im Backend.
  }

  if (response.status === 502 || response.status === 504) {
    return BACKEND_UNREACHABLE
  }

  if (response.status >= 500) {
    return (
      `Interner Fehler im Backend (Status ${response.status}). ` +
      'Details stehen in der Ausgabe des Backends.'
    )
  }

  return `Unerwarteter Fehler (Status ${response.status}).`
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response

  try {
    response = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    throw new ApiError(BACKEND_UNREACHABLE)
  }

  if (response.status === 401) {
    throw new UnauthorizedError(await readErrorMessage(response))
  }

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response))
  }

  return response.status === 204 ? (undefined as T) : response.json()
}

type User = { username: string }

// Das Backend setzt bei Erfolg ein Sitzungs-Cookie, das der Browser bei
// allen weiteren Anfragen mitschickt.
export function login(username: string, password: string): Promise<User> {
  return request('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function logout(): Promise<void> {
  return request('/api/logout', { method: 'POST' })
}

export function fetchCurrentUser(): Promise<User> {
  return request('/api/me')
}

export function fetchBookings(): Promise<Booking[]> {
  return request(BASE_URL)
}

// Stempeln: Den Zeitpunkt setzt das Backend (aktuelle Uhrzeit).
export function stampBooking(type: BookingType): Promise<Booking> {
  return request(`${BASE_URL}/stamp`, {
    method: 'POST',
    body: JSON.stringify({ type }),
  })
}

// Nachtragen mit eigenem Zeitpunkt.
export function createBookings(newBookings: NewBooking[]): Promise<Booking[]> {
  return request(BASE_URL, {
    method: 'POST',
    body: JSON.stringify(newBookings),
  })
}

export function updateBooking(
  id: number,
  type: BookingType,
  timestamp: string,
): Promise<Booking> {
  return request(`${BASE_URL}/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ type, timestamp }),
  })
}

// Liefert alle gelöschten Buchungen, inklusive mitgelöschter Partner.
export function deleteBooking(id: number): Promise<Booking[]> {
  return request(`${BASE_URL}/${id}`, { method: 'DELETE' })
}

type BookingChangeResponse = {
  id: number
  booking_id: number
  action: BookingChange['action']
  old_type: BookingType | null
  old_timestamp: string | null
  new_type: BookingType | null
  new_timestamp: string | null
  source: BookingSource | null
  changed_at: string
}

// Änderungsprotokoll, neueste Änderung zuerst.
export async function fetchBookingChanges(): Promise<BookingChange[]> {
  const changes: BookingChangeResponse[] = await request('/api/booking-changes')

  return changes.map((change) => ({
    id: change.id,
    bookingId: change.booking_id,
    action: change.action,
    oldType: change.old_type,
    oldTimestamp: change.old_timestamp,
    newType: change.new_type,
    newTimestamp: change.new_timestamp,
    source: change.source,
    changedAt: change.changed_at,
  }))
}

export function clearBookingChanges(): Promise<{ deleted: number }> {
  return request('/api/booking-changes', { method: 'DELETE' })
}
