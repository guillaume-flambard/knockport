import { login } from '../actions.ts'
import '../studio.css'

export const metadata = { title: 'studio sign in | knockport' }

type Props = { searchParams: Promise<{ error?: string }> }

export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams
  return (
    <main className="page studio">
      <p className="wordmark">knockport / studio</p>
      <h1>Sign in</h1>
      <p className="muted">
        The builder is a private tool. Enter the passphrase you were given.
      </p>
      <form action={login}>
        <label htmlFor="pass">Passphrase</label>
        <input
          id="pass"
          name="pass"
          type="password"
          required
          autoComplete="current-password"
        />
        {error ? (
          <p className="form-error" role="alert">
            That is not the passphrase.
          </p>
        ) : null}
        <button type="submit">Sign in</button>
      </form>
    </main>
  )
}