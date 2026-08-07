import './site.css'

/**
 * Domain root. The landing mirrors the Stitch reference: a header with the
 * product nav, a hero built around a terminal mockup, a The Journey section
 * as hairline rows, a single call to action, and a footer. The real entry
 * point for candidates is a journey link pasted into a job posting; this page
 * explains what that is.
 */
export const metadata = {
  title: 'knockport',
  description: 'Candidates who read your code before applying. A terminal they type into.',
}

export default function Home() {
  return (
    <div className="page landing">
      <link
        rel="preload"
        href="/terminal/ibm-plex-mono-400.woff2"
        as="font"
        type="font/woff2"
        crossOrigin="anonymous"
      />

      <header className="site-header">
        <div className="site-header-inner">
          <a className="site-logo" href="/">
            KNOCKPORT
          </a>
          <nav className="site-nav" aria-label="Product">
            <a href="/j/memo-labs">CANDIDATES</a>
            <a href="/studio/login">JOBS</a>
            <a href="/studio/login">STUDIO</a>
            <a href="/studio/login">DOCS</a>
          </nav>
          <a className="site-login" href="/studio/login">
            LOGIN
          </a>
        </div>
      </header>

      <main className="site-main">
        <section className="hero">
          <h1>The job offer you walk into.</h1>
          <p className="hero-sub">
            A single-purpose hiring tool. Candidates type their way in.
          </p>
        </section>

        <div className="sample terminal-mock" aria-label="Example of a candidate journey in a terminal">
          <div className="terminal-chrome" aria-hidden="true">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
          <div className="terminal-body">
            <div className="terminal-line">
              <span className="accent">knockport@hiring:~$</span> <span>ls</span>
            </div>
            <div className="terminal-out">
              README.md roles/ vision/
            </div>
            <div className="terminal-line">
              <span className="accent">knockport@hiring:~$</span> <span>cat whoami</span>
            </div>
            <div className="terminal-out">
              You are the candidate. We are the company. Let&apos;s talk.
            </div>
            <div className="terminal-line">
              <span className="accent">knockport@hiring:~$</span> <span>contact</span>
              <span className="terminal-cursor" aria-hidden="true" />
            </div>
          </div>
        </div>

        <section className="journey">
          <h2>The journey</h2>
          <div className="journey-row">
            <span className="journey-num">01.</span>
            <span className="journey-name">Discovery</span>
            <span className="journey-arrow" aria-hidden="true">→</span>
          </div>
          <div className="journey-row">
            <span className="journey-num">02.</span>
            <span className="journey-name">Interaction</span>
            <span className="journey-arrow" aria-hidden="true">→</span>
          </div>
          <div className="journey-row">
            <span className="journey-num">03.</span>
            <span className="journey-name">Decision</span>
            <span className="journey-arrow" aria-hidden="true">→</span>
          </div>
        </section>

        <section className="cta">
          <a className="cta-button" href="/j/memo-labs">
            INITIATE SEQUENCE
          </a>
        </section>

        <p>
          You get evidence rather than a score: what someone read, in what order, how long they
          stayed, what they asked. No ranking, no grade, no automated rejection. The hiring
          decision stays yours, and it stays explainable.
        </p>

        <p>
          There is always a plain, keyboard free version of every journey, because a friction that
          excludes a disabled candidate is discrimination rather than a filter.
        </p>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <span className="muted">© 2024 KNOCKPORT. TERMINAL_SYSTEM_V1.0</span>
          <nav aria-label="Legal">
            <a href="/">STATUS</a>
            <a href="/">SECURITY</a>
            <a href="/">PRIVACY</a>
            <a href="/">TERMS</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
