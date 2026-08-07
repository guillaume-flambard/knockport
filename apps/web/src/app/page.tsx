import './site.css'

/**
 * Domain root. Deliberately short: the real entry point is a journey link
 * pasted into a job posting, not this page.
 */
export const metadata = {
  title: 'knockport',
  description: 'Candidates who read your code before applying. A terminal they type into.',
}

export default function Home() {
  return (
    <main className="page">
      <link
        rel="preload"
        href="/terminal/ibm-plex-mono-400.woff2"
        as="font"
        type="font/woff2"
        crossOrigin="anonymous"
      />
      <p className="wordmark">knockport</p>

      <h1>
        The job offer you walk into<span className="accent">.</span>
      </h1>

      <p className="lead">
        A job posting gets around 254 applications. A recruiter spends most of a working day
        reading them to find the four people who actually looked at what the company builds.
        knockport reduces the input instead: candidates explore the company in a terminal, and
        only then get in touch.
      </p>

      <div className="sample" aria-label="Example of a candidate journey in a terminal">
        <span className="accent">~ $</span> ls -a{'\n'}
        <span className="accent">projects/</span>
        {'\n'}whoami <span className="dim">  who we are</span>
        {'\n'}stack <span className="dim">   what you would touch</span>
        {'\n'}role <span className="dim">    the role</span>
        {'\n'}.knock <span className="dim">  knock</span>
        {'\n'}
        {'\n'}
        <span className="accent">~ $</span> cat .knock{'\n'}
        You typed ls -a. Most people never do.
      </div>

      <section className="journey">
        <h2>The journey</h2>
        <div className="journey-row">
          <span className="journey-num">01</span>
          <span className="journey-name">Discovery</span>
          <span className="journey-desc">A candidate types their way through who you are, your stack and your role.</span>
        </div>
        <div className="journey-row">
          <span className="journey-num">02</span>
          <span className="journey-name">Interaction</span>
          <span className="journey-desc">They read before assuming. The quiet file is the tell, not a test.</span>
        </div>
        <div className="journey-row">
          <span className="journey-num">03</span>
          <span className="journey-name">Decision</span>
          <span className="journey-desc">The ones who stay reach your inbox, with everything they did behind them.</span>
        </div>
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

      <footer>
        <p className="muted">
          Built by <a href="https://github.com/guillaume-flambard">Guillaume Flambard</a>. The
          code is <a href="https://github.com/guillaume-flambard/knockport">on GitHub</a>. Still
          early, and looking for recruiters willing to tell me where it is wrong.
        </p>
      </footer>
    </main>
  )
}
