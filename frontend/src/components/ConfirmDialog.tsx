import { useEffect, useRef } from 'react'

type ConfirmDialogProps = {
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

// Modaler Bestätigungsdialog; Escape und "Abbrechen" brechen ab.
function ConfirmDialog({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

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

      <div className="form-actions">
        <button type="button" className="delete-button" onClick={onConfirm}>
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
