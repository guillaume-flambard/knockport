'use client'

import { useMemo, useState } from 'react'
import { execute, newSession, prompt } from '@knockport/core'
import type { Line, Output } from '@knockport/core'
import { assemble } from '../journey/assemble.ts'
import type { Section } from '../journey/assemble.ts'

/**
 * Live preview of the terminal, rendered from the same pure core functions the
 * real terminal runs. No network, no server round trip: the engine is already
 * here in the bundle, so the recruiter sees exactly what a candidate will see.
 *
 * Files are clickable; clicking one runs `cat <name>` against a throwaway
 * session. The preview mutates nothing.
 */

function RenderLines({ lines }: { lines: Line[] }) {
  return (
    <pre className="preview-scrollback" aria-hidden="true">
      {lines.map((line, i) => (
        <div key={i}>
          {line.spans.map((span, j) =>
            span.style === 'plain' ? (
              <span key={j}>{span.text}</span>
            ) : (
              <span key={j} className={span.style}>
                {span.text}
              </span>
            ),
          )}
        </div>
      ))}
    </pre>
  )
}

export function BuilderPreview({
  companyName,
  slug,
  title,
  banner,
  notice,
  sections,
}: {
  companyName: string
  slug: string
  title: string
  banner: string
  notice: string
  sections: Section[]
}) {
  const [opened, setOpened] = useState<string | undefined>()

  const { bannerLines, lsOut, openedOut, rootNames } = useMemo(() => {
    // The builder list order becomes the saved `order`; the preview must match
    // what a candidate will see, so renumber before assembling.
    const content = assemble(sections.map((s, i) => ({ ...s, order: i + 1 })))
    const rootNames = new Set(
      content.root.files.filter((f) => !f.hidden).map((f) => (f.hidden ? `.${f.name}` : f.name)),
    )
    const bannerLines: Line[] = banner
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((text) => ({ spans: [{ text, style: 'plain' as const }] }))

    const lsSession = newSession()
    const lsOut = execute(lsSession, content, 'ls', 0)

    let openedOut: Output | undefined
    if (opened) {
      const catSession = newSession()
      openedOut = execute(catSession, content, `cat ${opened}`, 0)
    }

    return { bannerLines, lsOut, openedOut, rootNames }
  }, [banner, sections, opened])

  // Titles align to the longest name, exactly like `ls` in the core. The ls
  // output lines already carry that padding, so a plain render is faithful.
  return (
    <div className="preview" aria-label={`Preview of the terminal at /j/${slug}`}>
      <div className="preview-chrome">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
        <span className="preview-title">{companyName ? `candidate@${slug}: ~` : title}</span>
      </div>
      <div className="preview-body">
        <RenderLines lines={bannerLines} />
        {notice ? (
          <div className="preview-notice" aria-hidden="true">
            {notice}
          </div>
        ) : null}
        <div className="preview-prompt" aria-hidden="true">
          <span className="sigil">~/s</span>
          <span>ls</span>
        </div>
        {lsOut.lines.map((line, i) => {
          const name = line.spans[0]?.text?.trim()
          const isDir = name?.endsWith('/') ?? false
          const clickable = !isDir && name !== undefined && rootNames.has(name)
          const inner = line.spans.map((span, j) =>
            span.style === 'plain' ? (
              <span key={j}>{span.text}</span>
            ) : (
              <span key={j} className={span.style}>
                {span.text}
              </span>
            ),
          )
          return (
            <div key={`ls-${i}`} className="preview-ls-row">
              <span className="sigil" aria-hidden="true">
                &nbsp;
              </span>
              {clickable ? (
                <button
                  type="button"
                  className="preview-file"
                  onClick={() => setOpened((current) => (current === name ? undefined : name))}
                >
                  {inner}
                </button>
              ) : (
                <span className="preview-file">{inner}</span>
              )}
            </div>
          )
        })}
        {opened && openedOut ? (
          <>
            <div className="preview-prompt" aria-hidden="true">
              <span className="sigil">~/s</span>
              <span>cat {opened}</span>
            </div>
            <RenderLines lines={openedOut.lines} />
          </>
        ) : null}
      </div>
    </div>
  )
}
