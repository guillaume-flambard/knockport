/**
 * Domain root. Intentionally brief: the real entry point is a journey link
 * pasted into a job posting, not this page.
 */
export const metadata = {
  title: 'knockport',
  description: 'Candidates who read your code before applying. A terminal they type into.',
}

export default function Home() {
  return (
    <main
      style={{
        maxWidth: '58ch',
        margin: '0 auto',
        padding: '5rem 1.25rem',
        font: "16px/1.7 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>knockport</h1>
      <p>
        A job posting gets 254 applications. A recruiter spends eight hours reading them to find
        the four people who actually looked at what the company builds.
      </p>
      <p>
        knockport puts a small terminal in front of the application. Candidates explore the
        company, its stack and its code, and only then get in touch. The ones who will not spend
        fifteen minutes on you never reach your inbox.
      </p>
      <p>
        You get evidence rather than a score: what someone read, in what order, and what they
        asked. The hiring decision stays yours.
      </p>
      <p style={{ opacity: 0.6, marginTop: '3rem' }}>
        Built by <a href="https://github.com/guillaume-flambard">Guillaume Flambard</a>. Still
        early, and looking for recruiters willing to tell me where it is wrong.
      </p>
    </main>
  )
}
