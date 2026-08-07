'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Section } from '../../../journey/assemble.ts'
import { saveJourney } from '../app/studio/actions.ts'
import { BuilderPreview } from './builder-preview.tsx'

export type BuilderDraft = {
  slug: string
  companyName: string
  website: string | null
  title: string
  banner: string
  notice: string | null
  sections: Section[]
  published: boolean
}

/** A blank section, the shape the demo starts every journey with. order is
 *  overwritten on save, so its value here is cosmetic. */
const BLANK: Section = {
  name: '',
  title: '',
  body: '',
  order: 0,
  hidden: false,
  dir: '',
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
const NAME_RE = /^[a-z0-9][a-z0-9_.-]{0,63}$/

const errorText: Record<string, string> = {
  slug: 'Slug: lowercase letters, numbers and hyphens, starting with a letter or number.',
  'slug-taken': 'That slug is already in use by another journey. Pick another.',
  companyName: 'Company name is required (200 characters max).',
  title: 'A title for the journey is required.',
  banner: 'The banner line shown at the top of the terminal is required.',
  'section-name': 'Each section needs a command name: lowercase, no spaces.',
  'section-title': 'Each section needs the label shown by ls.',
  'section-body': 'Each section needs a few lines of body text.',
  'section-dir': 'Directory names: lowercase letters, numbers and hyphens.',
  sections: 'Add at least one section.',
}

/**
 * The builder. A plain form, one field per Section property, with client
 * state only to re-order the list. The heavy lifting (slugs, widths, ls) is a
 * pure function server side, exactly like the terminal: this view just fills
 * it.
 *
 * `mode="create"` walks a first-time employer through three steps instead of
 * dumping the whole form at once. Editing stays one screen: the steps are a
 * ramp for someone new, not a cage for someone who knows the shape.
 *
 * Everything is controlled so the live preview on the right can re-render the
 * terminal from what is being typed. One POST at the end, as before.
 */
export function BuilderForm({
  draft,
  error,
  mode = 'edit',
}: {
  draft?: BuilderDraft
  error?: string
  mode?: 'create' | 'edit'
}) {
  const [sections, setSections] = useState<Section[]>(draft?.sections ?? [BLANK])
  const [step, setStep] = useState(1)
  const [companyName, setCompanyName] = useState(draft?.companyName ?? '')
  const [slug, setSlug] = useState(draft?.slug ?? '')
  const [website, setWebsite] = useState(draft?.website ?? '')
  const [title, setTitle] = useState(draft?.title ?? '')
  const [banner, setBanner] = useState(draft?.banner ?? '')
  const [notice, setNotice] = useState(draft?.notice ?? '')
  const [published, setPublished] = useState(draft?.published ?? true)
  const [showErrors, setShowErrors] = useState<Record<string, boolean>>({})

  // Draft persistence, create mode only. The wizard is a long flow; a browser
  // close mid-way would lose everything. This keeps a copy in the browser so
  // the next visit to /studio/new picks up where they stopped. Not a server
  // write: a half-finished journey is not a journey yet, and it must not
  // clutter the single-writer database with drafts nobody ever publishes.
  const draftStorageKey = 'knockport:draft'
  useEffect(() => {
    if (mode !== 'create') return
    const saved = window.localStorage.getItem(draftStorageKey)
    if (saved && !draft) {
      try {
        const d = JSON.parse(saved) as {
          companyName: string
          slug: string
          website: string
          title: string
          banner: string
          notice: string
          sections: Section[]
        }
        setCompanyName(d.companyName ?? '')
        setSlug(d.slug ?? '')
        setWebsite(d.website ?? '')
        setTitle(d.title ?? '')
        setBanner(d.banner ?? '')
        setNotice(d.notice ?? '')
        setSections(d.sections ?? [BLANK])
      } catch {
        window.localStorage.removeItem(draftStorageKey)
      }
    }
  }, [draft, mode])

  useEffect(() => {
    if (mode !== 'create') return
    const timeout = window.setTimeout(() => {
      window.localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          companyName,
          slug,
          website,
          title,
          banner,
          notice,
          sections,
        }),
      )
    }, 600)
    return () => window.clearTimeout(timeout)
  }, [mode, companyName, slug, website, title, banner, notice, sections])

  // Inline validation, on blur: the field either passes or shows its helper
  // message as an error. The server re-validates everything on POST, so this
  // is guidance, not the gate.
  const fieldErrors: Record<string, string | undefined> = useMemo(() => {
    const out: Record<string, string | undefined> = {}
    if (showErrors.slug && !SLUG_RE.test(slug.trim())) out.slug = errorText.slug
    if (showErrors.companyName && companyName.trim() === '') out.companyName = errorText.companyName
    if (showErrors.title && title.trim() === '') out.title = errorText.title
    if (showErrors.banner && banner.trim() === '') out.banner = errorText.banner
    if (showErrors.sections && sections.length === 0) out.sections = errorText.sections
    sections.forEach((s, i) => {
      const key = `section-${i}`
      if (!showErrors[key]) return
      if (!NAME_RE.test(s.name.trim())) out[key] = errorText['section-name']
      else if (s.title.trim() === '') out[key] = errorText['section-title']
      else if (s.body.trim() === '') out[key] = errorText['section-body']
      else if (s.dir && s.dir.trim() !== '' && !NAME_RE.test(s.dir.trim()))
        out[key] = errorText['section-dir']
    })
    return out
  }, [showErrors, slug, companyName, title, banner, sections])

  function update(i: number, patch: Partial<Section>): void {
    setSections(sections.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  function add(): void {
    setSections([...sections, { ...BLANK }])
  }

  function remove(i: number): void {
    setSections(sections.filter((_, idx) => idx !== i))
  }

  function move(i: number, delta: number): void {
    const j = i + delta
    if (j < 0 || j >= sections.length) return
    const next = [...sections]
    ;[next[i], next[j]] = [next[j], next[i]] as [Section, Section]
    setSections(next)
  }

  /** Client-side gate between wizard steps. The server re-validates everything
   *  on the single final POST, so these checks only keep a new employer from
   *  wandering into a blank screen. */
  function stepOk(n: number): boolean {
    if (n === 1) {
      return companyName.trim() !== '' && SLUG_RE.test(slug.trim())
    }
    if (n === 2) {
      if (title.trim() === '' || banner.trim() === '') return false
      return sections.some(
        (s) => NAME_RE.test(s.name.trim()) && s.title.trim() !== '' && s.body.trim() !== '',
      )
    }
    return true
  }

  function nextStep(n: number): void {
    if (!stepOk(n)) return
    setStep(n + 1)
  }

  const stepClasses = (n: number): string =>
    `wizard-step${mode === 'create' && step !== n ? ' hidden' : ''}`

  const preview = (
    <BuilderPreview
      companyName={companyName}
      slug={slug}
      title={title}
      banner={banner}
      notice={notice}
      sections={sections}
    />
  )

  return (
    <div className="builder-layout">
      <form action={saveJourney}>
        {error ? (
          <p className="form-error" role="alert">
            {errorText[error] ?? 'Something in there did not go through.'}
          </p>
        ) : null}

        <input type="hidden" name="editSlug" value={draft?.slug ?? ''} />

        {mode === 'create' ? (
          <ol className="wizard-steps" aria-label="Creation steps">
            <li className={step === 1 ? 'current' : ''}>Company</li>
            <li className={step === 2 ? 'current' : ''}>Journey</li>
            <li className={step === 3 ? 'current' : ''}>Contact &amp; publish</li>
          </ol>
        ) : null}

        <div className={stepClasses(1)}>
          <fieldset>
            <legend>The company</legend>
            <div className="inline-grid">
              <div>
                <label htmlFor="companyName">Company name</label>
                <input
                  id="companyName"
                  name="companyName"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  onBlur={() => setShowErrors((s) => ({ ...s, companyName: true }))}
                  className={fieldErrors.companyName ? 'invalid' : undefined}
                  required
                />
                {fieldErrors.companyName ? (
                  <p className="field-error">{fieldErrors.companyName}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="slug">Slug (the url /j/…)</label>
                <input
                  id="slug"
                  name="slug"
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  onBlur={() => setShowErrors((s) => ({ ...s, slug: true }))}
                  className={fieldErrors.slug ? 'invalid' : undefined}
                  required
                />
                <p className="helper">
                  Appears in the link you share: /j/{slug.trim() || '&lt;slug&gt;'}
                </p>
                {fieldErrors.slug ? <p className="field-error">{fieldErrors.slug}</p> : null}
              </div>
            </div>
            <label htmlFor="website">Website (optional)</label>
            <input
              id="website"
              name="website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
            />
          </fieldset>
          {mode === 'create' ? (
            <div className="wizard-nav">
              <button type="button" onClick={() => nextStep(1)}>
                Continue
              </button>
            </div>
          ) : null}
        </div>

        <div className={stepClasses(2)}>
          <fieldset>
            <legend>Title and banner</legend>
            <label htmlFor="title">Journey title (shown in the browser tab)</label>
            <input
              id="title"
              name="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setShowErrors((s) => ({ ...s, title: true }))}
              className={fieldErrors.title ? 'invalid' : undefined}
              required
            />
            {fieldErrors.title ? <p className="field-error">{fieldErrors.title}</p> : null}

            <label htmlFor="banner">Banner (the first lines of the terminal)</label>
            <textarea
              id="banner"
              name="banner"
              value={banner}
              onChange={(e) => setBanner(e.target.value)}
              onBlur={() => setShowErrors((s) => ({ ...s, banner: true }))}
              className={fieldErrors.banner ? 'invalid' : undefined}
              required
            />
            {fieldErrors.banner ? <p className="field-error">{fieldErrors.banner}</p> : null}

            <label htmlFor="notice">Notice (optional, shown under the banner)</label>
            <input
              id="notice"
              name="notice"
              type="text"
              value={notice}
              onChange={(e) => setNotice(e.target.value)}
            />
          </fieldset>

          <fieldset>
            <legend>Sections</legend>
            <p className="muted">
              Each section is a file the candidate can read with cat, and a command
              of its own. Order in the list is the order shown by ls.
            </p>
            {sections.map((s, i) => {
              const err = fieldErrors[`section-${i}`]
              return (
                <section className="section" key={i}>
                  <div className="section-title">
                    <legend>Section {i + 1}</legend>
                    <div>
                      <button type="button" className="link" onClick={() => move(i, -1)}>
                        up
                      </button>{' '}
                      <button type="button" className="link" onClick={() => move(i, 1)}>
                        down
                      </button>{' '}
                      <button type="button" className="link" onClick={() => remove(i)}>
                        remove
                      </button>
                    </div>
                  </div>
                  <div className="inline-grid">
                    <div>
                      <label htmlFor={`s-${i}-name`}>Name (the ls entry)</label>
                      <input
                        id={`s-${i}-name`}
                        name={`sections[${i}][name]`}
                        type="text"
                        value={s.name}
                        onChange={(e) => update(i, { name: e.target.value })}
                        onBlur={() => setShowErrors((st) => ({ ...st, [`section-${i}`]: true }))}
                        className={err ? 'invalid' : undefined}
                        required
                      />
                      <p className="helper">
                        What the candidate types to open this file.
                      </p>
                    </div>
                    <div>
                      <label htmlFor={`s-${i}-title`}>Label</label>
                      <input
                        id={`s-${i}-title`}
                        name={`sections[${i}][title]`}
                        type="text"
                        value={s.title}
                        onChange={(e) => update(i, { title: e.target.value })}
                        required
                      />
                      <p className="helper">Shown next to the name by ls.</p>
                    </div>
                  </div>
                  <label htmlFor={`s-${i}-body`}>Body</label>
                  <textarea
                    id={`s-${i}-body`}
                    name={`sections[${i}][body]`}
                    value={s.body}
                    onChange={(e) => update(i, { body: e.target.value })}
                    required
                  />
                  {err ? <p className="field-error">{err}</p> : null}
                  <div className="inline-grid">
                    <div>
                      <label htmlFor={`s-${i}-dir`}>Directory (optional)</label>
                      <input
                        id={`s-${i}-dir`}
                        name={`sections[${i}][dir]`}
                        type="text"
                        value={s.dir ?? ''}
                        onChange={(e) => update(i, { dir: e.target.value })}
                      />
                      <p className="helper">
                        Put this file inside a folder, e.g. <code>projects</code>.
                      </p>
                    </div>
                    <label className="check">
                      <input
                        type="checkbox"
                        name={`sections[${i}][hidden]`}
                        checked={s.hidden}
                        onChange={(e) => update(i, { hidden: e.target.checked })}
                      />{' '}
                      Hidden (only ls -a shows it)
                    </label>
                  </div>
                </section>
              )
            })}
            {fieldErrors.sections ? (
              <p className="field-error">{fieldErrors.sections}</p>
            ) : null}
            <button type="button" className="link" onClick={add}>
              Add a section
            </button>
          </fieldset>
          {mode === 'create' ? (
            <div className="wizard-nav">
              <button type="button" className="link" onClick={() => setStep(1)}>
                Back
              </button>{' '}
              <button type="button" onClick={() => nextStep(2)}>
                Continue
              </button>
            </div>
          ) : null}
        </div>

        <div className={stepClasses(3)}>
          <fieldset>
            <legend>Contact</legend>
            <p className="muted">
              Contact is built in, always on, and has nothing to configure. A
              candidate types <code>contact</code> in the terminal and answers
              three questions (name, email, message). <code>cancel</code> leaves
              at any time. What they send lands in your{' '}
              {draft?.slug ? (
                <a href={`/studio/j/${draft.slug}/inbox`}>inbox</a>
              ) : (
                'inbox'
              )}
              , as a timeline of their journey, not a score.
            </p>
            <p className="muted">
              The same questions are on the plain page{' '}
              <code>
                /j/{draft?.slug ?? '&lt;slug&gt;'}/profile
              </code>
              , for people who visit without JavaScript. Nothing else to do.
            </p>
          </fieldset>

          <p>
            <label className="check">
              <input
                type="checkbox"
                name="published"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
              />{' '}
              Publish now (otherwise it is saved as a draft)
            </label>
          </p>

          {mode === 'create' ? (
            <div className="wizard-nav">
              <button type="button" className="link" onClick={() => setStep(2)}>
                Back
              </button>{' '}
              <button type="submit">Create journey</button>
            </div>
          ) : (
            <button type="submit">Save journey</button>
          )}
        </div>
      </form>

      <aside className="builder-preview">{preview}</aside>
    </div>
  )
}
