import { Composition } from 'remotion'
import type { CalculateMetadataFunction } from 'remotion'
import { z } from 'zod'
import { DemoVideo } from './DemoVideo'

const FPS = 30

const sceneSchema = z.object({
  caption: z.string(),
  title: z.string().optional(),
  act: z.string().optional(),
  startMs: z.number(),
  endMs: z.number(),
  zoom: z.boolean().optional(),
})

export const propsSchema = z.object({
  scenes: z.array(sceneSchema),
  hasMusic: z.boolean(),
  hasWhoosh: z.boolean(),
})

export type Props = z.infer<typeof propsSchema>

const calculateMetadata: CalculateMetadataFunction<Props> = ({ props }) => {
  const scenes = props.scenes ?? []
  const lastEnd = scenes.length > 0 ? Math.max(...scenes.map((s) => s.endMs)) : 20_000
  return { durationInFrames: Math.ceil(((lastEnd + 1500) / 1000) * FPS) }
}

export const RemotionRoot: React.FC = () => (
  <Composition
    id="DemoVideo"
    component={DemoVideo}
    durationInFrames={30 * FPS}
    fps={FPS}
    width={1920}
    height={1080}
    schema={propsSchema}
    defaultProps={{ scenes: [], hasMusic: false, hasWhoosh: false }}
    calculateMetadata={calculateMetadata}
  />
)
