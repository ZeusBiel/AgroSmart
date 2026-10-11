import type { FormEvent } from 'react'
import { useState } from 'react'
import { LockKeyhole, Sprout } from 'lucide-react'
import { farm } from '../domain/farm'

export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Informe um e-mail válido.')
      return
    }
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    setError('')
    onLogin()
  }

  return (
    <main className="login-page">
      <section className="login-visual" aria-label="Vista aérea ilustrada de lavouras com pivôs centrais">
        <img src="agro-fields.svg" alt="" />
        <div className="mission-mark">
          <Sprout aria-hidden="true" />
          <span>AgroSmart</span>
        </div>
      </section>

      <section className="login-panel" aria-labelledby="login-title">
        <div>
          <p className="eyebrow">Plataforma de agricultura inteligente</p>
          <h1 id="login-title">Acesso do operador</h1>
          <p className="lead">
            Coleta IoT, processamento, análise e automação da irrigação da {farm.name}, em {farm.location}.
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <label htmlFor="email">
            E-mail
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="operador@fazenda.com"
              autoComplete="email"
            />
          </label>

          <label htmlFor="password">
            Senha
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="mínimo 6 caracteres"
              autoComplete="current-password"
            />
          </label>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <button className="primary-button" type="submit">
            <LockKeyhole aria-hidden="true" />
            Entrar no painel
          </button>
          <button className="secondary-button" type="button" onClick={onLogin}>
            Entrar em modo demonstração
          </button>
        </form>
      </section>
    </main>
  )
}
