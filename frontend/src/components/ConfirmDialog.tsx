import { useEffect, useRef, useState } from 'react'
import { ReasonInput } from './DateTimeInputs'

type ConfirmDialogProps = {
  message: string
  confirmLabel: string
  onConfirm: (reason: string) => void
  onCancel: () => void
}

// Modaler Bestätigungsdialog mit Pflichtfeld für die Begründung; Escape und
// "Abbrechen" brechen ab.
function ConfirmDialog({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current

    dialog?.showModal()

    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
    >
      <p>{message}</p>

      <ReasonInput value={reason} onChange={setReason} />

      <div className="form-actions">
        <button
          type="button"
          className="delete-button"
          disabled={reason.trim() === ''}
          onClick={() => onConfirm(reason.trim())}
        >
          {confirmLabel}
        </button>

        <button
          type="button"
          className="secondary-button"
          onClick={onCancel}
          autoFocus
        >
          Abbrechen
        </button>
      </div>
    </dialog>
  )
}

export default ConfirmDialog
