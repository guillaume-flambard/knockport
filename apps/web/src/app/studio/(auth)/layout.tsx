import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { isAuthed } from '../auth.ts'
import { logout } from '../actions.ts'
import '../studio.css'
/** Everything under this group requires the studio passphrase. Login does
 *  not, otherwise the guard would bounce the login page itself forever. */
export default async function StudioLayout({ children }: { children: ReactNode }) {
  if (!(await isAuthed())) redirect('/studio/login')

  return (
    <div className="page studio">
      <header className="studio-head">
        <p className="wordmark">knockport / studio</p>
        <form action={logout}>
          <button type="submit" className="link">
            sign out
          </button>
        </form>
      </header>
      <main>{children}</main>
    </div>
  )
}