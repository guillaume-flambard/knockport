import { Fragment } from 'react'
import {
  AbsoluteFill,
  Audio,
  Easing,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
} from 'remotion'
import { Video } from '@remotion/media'
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
import { makeTransform, translateY } from '@remotion/animation-utils'

export type Scene = {
  caption: string
  title?: string
  act?: string
  startMs: number
  endMs: number
  /** True to apply a gentle push-in on this scene only. */
  zoom?: boolean
}

/**
 * The demo composition, 1080p. Scenes come from out/timings.json via --props.
 * Official pieces throughout: <Video> from @remotion/media for the capture,
 * TransitionSeries with fade() between scenes, and TikTok-style animated
 * captions (word by word) built from each scene's caption.
 */

const FADE_IN = 18
const TRANSITION_FRAMES = 14

function useEaseIn(frame: number, duration = FADE_IN, fromY = 22): number {
  const progress = interpolate(frame, [0, duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const eased = Easing.out(Easing.cubic)(progress)
  return (1 - eased) * fromY
}

function Title({ text }: { text: string }) {
  const frame = useCurrentFrame()
  const y = useEaseIn(frame, FADE_IN, 24)
  const opacity = interpolate(frame, [0, FADE_IN], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <div
      style={{
        position: 'absolute',
        top: 48,
        left: 72,
        fontFamily: 'monospace',
        fontSize: 46,
        fontWeight: 700,
        color: '#7fd6d1',
        background: 'rgba(11,13,14,0.78)',
        borderLeft: '5px solid #7fd6d1',
        padding: '14px 24px',
        borderRadius: 6,
        opacity,
        transform: makeTransform([translateY(y)]),
        boxShadow: '0 6px 32px rgba(0,0,0,0.45)',
      }}
    >
      {text}
    </div>
  )
}

/** TikTok-style animated caption: words appear one by one, active word lit. */
function Caption({
  words,
  frame,
}: {
  words: { text: string; fromMs: number; toMs: number }[]
  frame: number
}) {
  const { fps } = useVideoConfig()
  const nowMs = (frame / fps) * 1000
  const visible = words.filter((w) => nowMs >= w.fromMs - 150)
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 64,
        left: '50%',
        transform: 'translateX(-50%)',
        fontFamily: 'monospace',
        fontSize: 40,
        color: '#e8e6e1',
        textAlign: 'center',
        opacity,
        maxWidth: '88%',
        whiteSpace: 'pre-wrap',
        textShadow: '0 2px 12px rgba(0,0,0,0.7)',
      }}
    >
      {visible.map((w, i) => {
        const isActive = nowMs >= w.fromMs && nowMs < w.toMs
        return (
          <span key={i} style={{ color: isActive ? '#7fd6d1' : '#e8e6e1' }}>
            {w.text}
          </span>
        )
      })}
    </div>
  )
}

/** Full-screen chapter card: slide + growing rule, then fade out. */
function ActCard({ act, frame }: { act: string; frame: number }) {
  const opacity = interpolate(frame, [0, 18, 140, 160], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const titleY = useEaseIn(frame, 30, 30)
  const ruleW = interpolate(frame, [20, 52], [0, 120], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        background: 'rgba(11,13,14,0.6)',
        opacity,
      }}
    >
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 76,
          fontWeight: 700,
          color: '#7fd6d1',
          textAlign: 'center',
          letterSpacing: '0.06em',
          transform: `translateY(${titleY}px)`,
          textShadow: '0 8px 48px rgba(0,0,0,0.6)',
        }}
      >
        {act}
      </div>
      <div style={{ height: 5, width: ruleW, background: '#7fd6d1', marginTop: 26, borderRadius: 2 }} />
    </AbsoluteFill>
  )
}

/** Turns a scene's caption string into word tokens spread across the scene. */
function wordsForScene(scene: Scene): { text: string; fromMs: number; toMs: number }[] {
  const parts = scene.caption.split(' ')
  if (parts.length === 1) return [{ text: scene.caption, fromMs: scene.startMs, toMs: scene.endMs }]
  const span = Math.max(1, scene.endMs - scene.startMs)
  const per = span / parts.length
  return parts.map((word, i) => ({
    // Leading space so the CSS keeps spacing; first word keeps none.
    text: i === 0 ? word : ` ${word}`,
    fromMs: scene.startMs + i * per,
    toMs: scene.startMs + (i + 1) * per,
  }))
}

export const DemoVideo: React.FC<{ scenes: Scene[]; hasMusic: boolean; hasWhoosh: boolean }> = ({
  scenes = [],
  hasMusic = false,
  hasWhoosh = false,
}) => {
  const { fps, durationInFrames } = useVideoConfig()
  const frameOf = (ms: number) => Math.round((ms / 1000) * fps)

  // Chapter cards: once per distinct act.
  const acts: { act: string; startFrame: number }[] = []
  for (const scene of scenes) {
    if (scene.act && !acts.some((a) => a.act === scene.act)) {
      acts.push({ act: scene.act, startFrame: frameOf(scene.startMs) })
    }
  }

  // A whoosh at each cut, played the moment the transition starts.
  const cutFrames = scenes.slice(0, -1).map((s) => frameOf(s.endMs) - 2)

  return (
    <AbsoluteFill style={{ background: '#0b0d0e' }}>
      {/* The capture, played through the official <Video>; scenes fade into
          each other with the official TransitionSeries. */}
      <TransitionSeries>
        {scenes.map((scene, i) => {
          const startFrame = frameOf(scene.startMs)
          const endFrame = frameOf(scene.endMs)
          const duration = endFrame - startFrame
          const words = wordsForScene(scene)
          return (
            <Fragment key={i}>
              <TransitionSeries.Sequence durationInFrames={duration}>
                <AbsoluteFill>
                  <SceneVideo zoom={scene.zoom ?? false} trimBefore={startFrame} trimAfter={endFrame} />
                  {scene.title ? <Title text={scene.title} /> : null}
                  {scene.caption ? (
                    <Sequence from={0} durationInFrames={duration}>
                      <CaptionOn words={words} />
                    </Sequence>
                  ) : null}
                </AbsoluteFill>
              </TransitionSeries.Sequence>
              {i < scenes.length - 1 ? (
                <TransitionSeries.Transition
                  presentation={fade()}
                  timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
                />
              ) : null}
            </Fragment>
          )
        })}
      </TransitionSeries>

      {/* Chapter cards on top, independent of the transitions. */}
      {acts.map(({ act, startFrame }, i) => (
        <Sequence key={`act-${i}`} from={startFrame} durationInFrames={160}>
          <ActFrame act={act} />
        </Sequence>
      ))}

      {hasMusic ? (
        <Audio
          src={staticFile('background.mp3')}
          volume={(f) =>
            interpolate(f, [0, durationInFrames], [0.3, 0.3], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          }
        />
      ) : null}

      {/* A soft whoosh at each scene cut. */}
      {hasWhoosh
        ? cutFrames.map((cut, i) => (
            <Sequence key={`whoosh-${i}`} from={cut} durationInFrames={Math.round(0.18 * fps)}>
              <Audio src={staticFile('whoosh.mp3')} volume={0.5} />
            </Sequence>
          ))
        : null}
    </AbsoluteFill>
  )
}

function CaptionOn({ words }: { words: { text: string; fromMs: number; toMs: number }[] }) {
  const frame = useCurrentFrame()
  return <Caption words={words} frame={frame} />
}

function ActFrame({ act }: { act: string }) {
  const frame = useCurrentFrame()
  return <ActCard act={act} frame={frame} />
}

/** The capture for one scene. A gentle push-in on flagged scenes only; the
 *  rest stay steady, so the zoom is an accent, never a habit. */
function SceneVideo({
  zoom,
  trimBefore,
  trimAfter,
}: {
  zoom: boolean
  trimBefore: number
  trimAfter: number
}) {
  const frame = useCurrentFrame()
  const t = Math.max(1, trimAfter - trimBefore)
  const scale = zoom
    ? interpolate(frame, [0, t], [1, 1.07], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1
  return (
    <Video
      src={staticFile('capture.webm')}
      trimBefore={trimBefore}
      trimAfter={trimAfter}
      style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})` }}
    />
  )
}
