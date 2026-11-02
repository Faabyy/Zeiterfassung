import React, { useState } from 'react'

type LoginFormProps = {
  onLogin: (username: string, password: string) => Promise<string | null>
}

// Anmeldung mit den Benutzern aus der .env, eine Registrierung gibt es nicht.
function LoginForm({ onLogin }: LoginFormProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setIsSaving(true)

    const loginError = await onLogin(username.trim(), password)

    setIsSaving(false)

    if (loginError) {
      setError(loginError)
      setPassword('')
    }
  }

  return (
    <form className="card login-form" onSubmit={handleSubmit}>
      <h2>Anmelden</h2>

      <label>
        Benutzername
        <input
          type="text"
          autoComplete="username"
          autoFocus
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>

      <label>
        Passwort
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      <div className="form-actions">
        <button
          type="submit"
          disabled={isSaving || username.trim() === '' || password === ''}
        >
          Anmelden
        </button>
      </div>

      {error && <p className="error">{error}</p>}
    </form>
  )
}

export default LoginForm
