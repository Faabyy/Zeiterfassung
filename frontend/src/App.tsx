import { useEffect, useRef, useState } from 'react'
import BookingForm from './components/BookingForm'
import BookingList from './components/BookingList'
import ChangeHistory from './components/ChangeHistory'
import ConfirmDialog from './components/ConfirmDialog'
import DaySummary from './components/DaySummary'
import LoginForm from './components/LoginForm'
import * as bookingApi from './api/bookings'
import { UnauthorizedError } from './api/bookings'
import { BOOKING_TYPE_LABELS } from './types/booking'
import type {
  Booking,
  BookingChange,
  BookingType,
  NewBooking,
} from './types/booking'
import {
  filterBookingsByWorkDay,
  findBookingGroup,
  findOpenShift,
} from './utils/bookingGroups'
import {
  formatDateKey,
  formatTimestamp,
  toLocalTimestamp,
} from './utils/timeUtils'

// Aktuelle Minute als Zeitstempel, aktualisiert sich alle 15 Sekunden.
// Damit laufen die Zeiten der offenen Schicht mit, und "heute" wechselt
// um Mitternacht auch bei offener Seite.
function useCurrentMinute(): string {
  const [now, setNow] = useState(() => toLocalTimestamp(new Date()))

  useEffect(() => {
    const timer = setInterval(
      () => setNow(toLocalTimestamp(new Date())),
      15 * 1000,
    )

    return () => clearInterval(timer)
  }, [])

  return now
}

function describeDeletion(bookings: Booking[], id: number): string {
  const group = findBookingGroup(bookings, id)
  const booking = group.find((candidate) => candidate.id === id)!

  if (group.length === 1) {
    return `${BOOKING_TYPE_LABELS[booking.type]} vom ${formatTimestamp(booking.timestamp)} wirklich löschen?`
  }

  const first = group[0]
  const last = group[group.length - 1]
  const what =
    booking.type === 'KOMMEN' || booking.type === 'GEHEN'
      ? 'die ganze Schicht'
      : 'die ganze Pause'

  return (
    `Damit die Buchungsfolge gültig bleibt, wird ${what} gelöscht ` +
    `(${group.length} Buchungen von ${formatTimestamp(first.timestamp)} ` +
    `bis ${formatTimestamp(last.timestamp)}). Fortfahren?`
  )
}

function App() {
  // null: nicht angemeldet. Beim Start wird die Sitzung erst geprüft.
  const [username, setUsername] = useState<string | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [changes, setChanges] = useState<BookingChange[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [globalError, setGlobalError] = useState('')
  const [bookingToEdit, setBookingToEdit] = useState<Booking | null>(null)
  const [bookingIdToDelete, setBookingIdToDelete] = useState<number | null>(
    null,
  )
  const errorRef = useRef<HTMLParagraphElement>(null)

  // Die Buchungsliste zeigt einen Arbeitstag, standardmäßig heute
  // (null: immer der aktuelle Tag, auch nach Mitternacht).
  const now = useCurrentMinute()
  const today = now.slice(0, 10)
  const [chosenDate, setChosenDate] = useState<string | null>(null)
  const selectedDate = chosenDate ?? today
  const isToday = selectedDate === today

  // Eine laufende Schicht von gestern (Nachtschicht) gehört zu heute.
  const dayBookings = filterBookingsByWorkDay(bookings, selectedDate)
  const openShift = findOpenShift(bookings)
  const showsOpenShift = isToday && dayBookings.length === 0 && openShift.length > 0
  const listBookings = showsOpenShift ? openShift : dayBookings

  function resetSession() {
    setUsername(null)
    setBookings([])
    setChanges([])
    setBookingToEdit(null)
    setBookingIdToDelete(null)
  }

  // Ist die Sitzung abgelaufen, geht es zurück zur Anmeldung.
  function showError(error: unknown, prefix = '') {
    if (error instanceof UnauthorizedError) {
      resetSession()
      setGlobalError('Die Sitzung ist abgelaufen. Bitte erneut anmelden.')
      return
    }

    setGlobalError(prefix + (error as Error).message)
  }

  // Nach jeder Änderung wird die Liste neu geladen, damit immer der
  // Stand der Datenbank angezeigt wird.
  async function reloadBookings() {
    try {
      setBookings(await bookingApi.fetchBookings())
      setChanges(await bookingApi.fetchBookingChanges())
    } catch (error) {
      showError(error)
    } finally {
      setIsLoading(false)
    }
  }

  // Beim Start prüfen, ob noch eine Sitzung besteht.
  useEffect(() => {
    async function restoreSession() {
      try {
        const user = await bookingApi.fetchCurrentUser()
        setUsername(user.username)
      } catch (error) {
        if (!(error instanceof UnauthorizedError)) {
          setGlobalError((error as Error).message)
        }

        setIsLoading(false)
        return
      }

      await reloadBookings()
    }

    restoreSession()
  }, [])

  // Liefert bei falschen Zugangsdaten die Fehlermeldung für das Formular.
  async function login(name: string, password: string) {
    try {
      const user = await bookingApi.login(name, password)
      setUsername(user.username)
    } catch (error) {
      return (error as Error).message
    }

    setGlobalError('')
    setChosenDate(null)
    await reloadBookings()
    return null
  }

  async function logout() {
    try {
      await bookingApi.logout()
    } catch (error) {
      showError(error)
      return
    }

    resetSession()
    setGlobalError('')
  }

  // Fehler stehen oben auf der Seite; dorthin scrollen, damit sie auch
  // nach einem Klick weiter unten (z. B. in der Liste) sichtbar sind.
  useEffect(() => {
    if (globalError) {
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [globalError])

  // Führt eine Anlage aus und lädt danach neu; Fehler landen oben auf
  // der Seite. Liefert, ob die Anlage geklappt hat.
  async function runAndReload(action: () => Promise<unknown>) {
    try {
      await action()
    } catch (error) {
      showError(error)
      return false
    }

    setGlobalError('')
    await reloadBookings()
    return true
  }

  async function stampBooking(type: BookingType) {
    await runAndReload(() => bookingApi.stampBooking(type))
  }

  // Mehrere Buchungen (z. B. PAUSE_START + PAUSE_ENDE) werden gemeinsam
  // geprüft, damit sich auch Paare in abgeschlossene Tage nachtragen lassen.
  function backfillBookings(newBookings: NewBooking[]): Promise<boolean> {
    return runAndReload(() => bookingApi.createBookings(newBookings))
  }

  function startEditing(booking: Booking) {
    setBookingToEdit(booking)
    setGlobalError('')
  }

  function cancelEditing() {
    setBookingToEdit(null)
    setGlobalError('')
  }

  async function updateBooking(
    id: number,
    type: BookingType,
    timestamp: string,
  ) {
    try {
      await bookingApi.updateBooking(id, type, timestamp)
    } catch (error) {
      showError(error, 'Die Korrektur konnte nicht gespeichert werden: ')
      return
    }

    setBookingToEdit(null)
    setGlobalError('')
    await reloadBookings()
  }

  function requestDeletion(id: number) {
    setBookingIdToDelete(id)
  }

  async function deleteBooking(id: number) {
    setBookingIdToDelete(null)

    let deletedBookings: Booking[]

    try {
      deletedBookings = await bookingApi.deleteBooking(id)
    } catch (error) {
      showError(error, 'Die Buchung wurde nicht gelöscht: ')
      return
    }

    if (deletedBookings.some((booking) => booking.id === bookingToEdit?.id)) {
      setBookingToEdit(null)
    }

    setGlobalError('')
    await reloadBookings()
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Zeiterfassung</h1>

        {username && (
          <div className="user-info">
            <span className="muted">Angemeldet als</span>{' '}
            <strong>{username}</strong>
            <button
              type="button"
              className="small-button secondary-button"
              onClick={logout}
            >
              Abmelden
            </button>
          </div>
        )}
      </header>

      {globalError && (
        <p ref={errorRef} className="error global-error" role="alert">
          {globalError}
        </p>
      )}

      {isLoading ? (
        <p>Buchungen werden geladen …</p>
      ) : username === null ? (
        <LoginForm onLogin={login} />
      ) : (
        <>
          <div className="top-row">
            <BookingForm
              bookings={bookings}
              onStamp={stampBooking}
              onBackfill={backfillBookings}
              bookingToEdit={bookingToEdit}
              onUpdateBooking={updateBooking}
              onCancelEdit={cancelEditing}
            />

            <BookingList
              title={
                showsOpenShift
                  ? 'Laufende Schicht'
                  : isToday
                    ? 'Heutige Buchungen'
                    : `Buchungen vom ${formatDateKey(selectedDate)}`
              }
              workDay={showsOpenShift ? openShift[0].timestamp.slice(0, 10) : selectedDate}
              bookings={listBookings}
              onShowToday={isToday ? undefined : () => setChosenDate(null)}
              onEditBooking={startEditing}
              onDeleteBooking={requestDeletion}
            />
          </div>

          <DaySummary
            bookings={bookings}
            now={now}
            selectedDate={selectedDate}
            onSelectDate={(date) => setChosenDate(date === today ? null : date)}
          />

          <ChangeHistory changes={changes} />
        </>
      )}

      {bookingIdToDelete !== null && (
        <ConfirmDialog
          message={describeDeletion(bookings, bookingIdToDelete)}
          confirmLabel="Löschen"
          onConfirm={() => deleteBooking(bookingIdToDelete)}
          onCancel={() => setBookingIdToDelete(null)}
        />
      )}

    </div>
  )
}

export default App
