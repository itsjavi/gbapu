import type { EngineAudioRegisterToken, EngineAudioValueToken } from './audio-command-tokens.ts'

export type AudioCategory = 'music' | 'sfx' | 'cries' | 'generated'

export type EngineAudioChannelId = 1 | 2 | 3 | 4

/**
 * Audio write instruction.
 *
 * Format: `[register, value]`
 * - `register`: register token like `n21`, `n22`, `w30`
 * - `value`: raw byte value or token aliases for drum/noise constants.
 *   Prefix legend for value tokens:
 *   - `sn` = snare
 *   - `dr` = drum
 *   - `tr` = triangle
 *   - `hh` = hi-hat
 *   - `ki` = kick
 *   - `cr` = crash
 */
export type EngineAudioWriteCommand = readonly [
  register: EngineAudioRegisterToken,
  value: number | EngineAudioValueToken,
]

/**
 * Audio sleep/wait virtual instruction.
 *
 * Format: `['wait', cycles]`
 */
export type EngineAudioWaitCommand = readonly [instruction: 'wait', cycles: number]

/**
 * Audio end virtual instruction.
 *
 * Format: `['end']`
 */
export type EngineAudioEndCommand = readonly [instruction: 'end']

/** Source driver control; it changes arbitration rather than an APU register. */
export type EngineAudioPriorityCommand = readonly [instruction: 'sfx_priority', enabled: 0 | 1]

/** Conditional source panning differs from forced routing when mono is selected. */
export type EngineAudioPanningCommand = readonly [
  instruction: 'stereo_panning' | 'force_stereo_panning',
  tracks: number,
]
export type EngineAudioTempoCommand = readonly [instruction: 'tempo', value: number]

/** Optional source-unit program for roles whose future timing can change while retained. */
export type PulseDriverProgram = {
  schema_version: 1
  source_label: string
  frequency_table: readonly number[]
  commands: readonly (readonly (string | number)[])[]
}

/** Resolved effect commands retain source units and mutable channel parameters. */
export type EffectDriverProgram = {
  schema_version: 1
  source_label: string
  source_channel: 5 | 6 | 7 | 8
  initial_tempo: number
  initial_pitch: number
  pitch_offset_enabled: boolean
  frequency_table: readonly number[]
  commands: readonly (readonly (string | number)[])[]
  noise_samples?: NoiseSampleBank
  wave_samples?: WaveSampleBank
}

/** Original packed wave RAM bytes, with an extensible number of patterns. */
export type WaveSampleBank = {
  schema_version: 1
  patterns: readonly (readonly number[])[]
}

/** Literal source sample bytes; the terminal 0xff remains an addressable step. */
export type NoiseSampleBank = {
  schema_version: 1
  kits: readonly (readonly string[])[]
  samples: Readonly<Record<string, readonly (readonly number[])[]>>
}

export type NoiseDriverProgram = Omit<EffectDriverProgram, 'source_channel'> & {
  source_channel: 4
  noise_samples: NoiseSampleBank
}

export type WaveDriverProgram = Omit<EffectDriverProgram, 'source_channel'> & {
  source_channel: 3
  wave_samples: WaveSampleBank
}

export type MusicPulseDriverProgram = Omit<EffectDriverProgram, 'source_channel'> & {
  source_channel: 2
}

export type EngineAudioCommand =
  | EngineAudioWriteCommand
  | EngineAudioWaitCommand
  | EngineAudioEndCommand
  | EngineAudioPriorityCommand
  | EngineAudioPanningCommand
  | EngineAudioTempoCommand

export type EngineAudioChannelData = {
  id: EngineAudioChannelId
  sourceChannel?: number
  label?: string
  loopStartCommandIndex?: number
  commands: readonly EngineAudioCommand[]
  /** Original note/rest parses, excluding synthesized held-note register writes. */
  sourceNoteCommandIndices?: readonly number[]
  pulse_driver?: PulseDriverProgram
  effect_driver?: EffectDriverProgram
  noise_driver?: NoiseDriverProgram
  noise_driver_unavailable?: string
  wave_driver?: WaveDriverProgram
  wave_driver_unavailable?: string
  music_pulse_driver?: MusicPulseDriverProgram
  music_pulse_driver_unavailable?: string
  /** A valid baked stem does not establish mutable-driver coverage for this role. */
  effect_driver_unavailable?: string
}

export type EngineAudioMetadata = {
  id: string
  name: string
  category: AudioCategory
  sourceLabel: string
  /** Ordinal in the pinned source pointer table, independent of the namespaced ID. */
  sourceIndex?: number
}

export type EngineAudioData = EngineAudioMetadata & {
  channels: readonly EngineAudioChannelData[]
}

export type EngineAudioCatalogEntry = EngineAudioMetadata & {
  load: () => Promise<EngineAudioData>
}
