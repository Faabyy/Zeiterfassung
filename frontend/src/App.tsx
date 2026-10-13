import { useEffect, useRef, useState } from 'react'
import BookingForm from './components/BookingForm'
import BookingList from './components/BookingList'
import ChangeHistory from './components/ChangeHistory'
import ConfirmDialog from './components/ConfirmDialog'
import DaySummary from './components/DaySummary'
import * as bookingApi from './api/bookings'
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
} from './utils/bookingGroups'
import {
  formatDateKey,
  formatTimestamp,
  toLocalTimestamp,
} from './utils/timeUtils'

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
  const [bookings, setBookings] = useState<Booking[]>([])
  const [changes, setChanges] = useState<BookingChange[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [globalError, setGlobalError] = useState('')
  const [bookingToEdit, setBookingToEdit] = useState<Booking | null>(null)
  const [bookingIdToDelete, setBookingIdToDelete] = useState<number | null>(
    null,
  )
  const [isClearingHistory, setIsClearingHistory] = useState(false)
  const errorRef = useRef<HTMLParagraphElement>(null)

  // Die Buchungsliste zeigt einen Arbeitstag, standardmäßig heute.
  const today = toLocalTimestamp(new Date()).slice(0, 10)
  const [selectedDate, setSelectedDate] = useState(today)
  const isToday = selectedDate === today

  // Nach jeder Änderung wird die Liste neu geladen, damit immer der
  // Stand der Datenbank angezeigt wird.
  async function reloadBookings() {
    try {
      setBookings(await bookingApi.fetchBookings())
      setChanges(await bookingApi.fetchBookingChanges())
    } catch (error) {
      setGlobalError((error as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    reloadBookings()
  }, [])

  // Fehler stehen oben auf der Seite; dorthin scrollen, damit sie auch
  // nach einem Klick weiter unten (z. B. in der Liste) sichtbar sind.
  useEffect(() => {
    if (globalError) {
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [globalError])

  // Mehrere Buchungen (z. B. PAUSE_START + PAUSE_ENDE) werden gemeinsam
  // geprüft, damit sich auch Paare in abgeschlossene Tage nachtragen lassen.
  async function addBookings(newBookings: NewBooking[]): Promise<boolean> {
    try {
      await bookingApi.createBookings(newBookings)
    } catch (error) {
      setGlobalError((error as Error).message)
      return false
    }

    setGlobalError('')
    await reloadBookings()
    return true
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
      setGlobalError(
        `Die Korrektur konnte nicht gespeichert werden: ${(error as Error).message}`,
      )
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
      setGlobalError(
        `Die Buchung wurde nicht gelöscht: ${(error as Error).message}`,
      )
      return
    }

    if (deletedBookings.some((booking) => booking.id === bookingToEdit?.id)) {
      setBookingToEdit(null)
    }

    setGlobalError('')
    await reloadBookings()
  }

  async function clearHistory() {
    setIsClearingHistory(false)

    try {
      await bookingApi.clearBookingChanges()
    } catch (error) {
      setGlobalError(
        `Die Historie wurde nicht geleert: ${(error as Error).message}`,
      )
      return
    }

    setGlobalError('')
    await reloadBookings()
  }

  return (
    <div className="app">
      <h1>Zeiterfassung</h1>

      {globalError && (
        <p ref={errorRef} className="error global-error" role="alert">
          {globalError}
        </p>
      )}

      {isLoading ? (
        <p>Buchungen werden geladen …</p>
      ) : (
        <>
          <div className="top-row">
            <BookingForm
              bookings={bookings}
              onAddBookings={addBookings}
              bookingToEdit={bookingToEdit}
              onUpdateBooking={updateBooking}
              onCancelEdit={cancelEditing}
            />

            <BookingList
              title={
                isToday
                  ? 'Heutige Buchungen'
                  : `Buchungen vom ${formatDateKey(selectedDate)}`
              }
              workDay={selectedDate}
              bookings={filterBookingsByWorkDay(bookings, selectedDate)}
              onShowToday={isToday ? undefined : () => setSelectedDate(today)}
              onEditBooking={startEditing}
              onDeleteBooking={requestDeletion}
            />
          </div>

          <DaySummary
            bookings={bookings}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />

          <ChangeHistory
            changes={changes}
            onClear={() => setIsClearingHistory(true)}
          />
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

      {isClearingHistory && (
        <ConfirmDialog
          message="Die komplette Änderungshistorie löschen? Die Buchungen selbst bleiben erhalten."
          confirmLabel="Leeren"
          onConfirm={clearHistory}
          onCancel={() => setIsClearingHistory(false)}
        />
      )}
    </div>
  )
}

export default App
