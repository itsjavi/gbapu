// Small sounds authored for the tests. No game audio data.
import type { EngineAudioCommand, EngineAudioData, EngineAudioRegisterToken } from '../src/index.ts'

/** Game Boy CPU clock: `wait` commands count these cycles. */
export const CPU_HZ = 4_194_304

/** A tenth of a second. */
export const TENTH = CPU_HZ / 10

const meta = (name: string) =>
  ({ id: `test:${name}`, name, category: 'generated', sourceLabel: 'Test' }) as const

/** A 50% duty square wave on pulse channel 1, `x` being the 11-bit frequency register value. */
export function pulseTone(x: number, cycles = TENTH): EngineAudioData {
  return {
    ...meta('pulse'),
    channels: [
      {
        id: 1,
        commands: [
          ['n11', 0x80],
          ['n12', 0xf0],
          ['n13', x & 0xff],
          ['n14', 0x80 | (x >> 8)],
          ['wait', cycles],
          ['end'],
        ],
      },
    ],
  }
}

/** Writes a rising ramp to the 16 bytes of wave RAM (`w30`..`w3f`). */
const waveRam: EngineAudioCommand[] = Array.from({ length: 16 }, (_, i) => [
  `w${(0x30 + i).toString(16)}` as EngineAudioRegisterToken,
  i * 17,
])

export const waveTone: EngineAudioData = {
  ...meta('wave'),
  channels: [
    {
      id: 3,
      commands: [
        ['n1a', 0],
        ...waveRam,
        ['n1a', 0x80],
        ['n1c', 0x20],
        ['n1d', 0],
        ['n1e', 0x87],
        ['wait', TENTH],
        ['end'],
      ],
    },
  ],
}

export const noiseHit: EngineAudioData = {
  ...meta('noise'),
  channels: [
    {
      id: 4,
      commands: [['n21', 0xa0], ['n22', 0x35], ['n23', 0x80], ['wait', TENTH], ['end']],
    },
  ],
}

/** One beat of the test song, in CPU cycles. */
export const BEAT = 70_000

/**
 * A three-channel song: two pulse notes with a loop over the second one, a wave note and two drum
 * hits written with drum value tokens.
 */
export const song: EngineAudioData = {
  ...meta('song'),
  category: 'music',
  channels: [
    {
      id: 1,
      loopStartCommandIndex: 6,
      commands: [
        ['tempo', 120],
        ['n11', 0x80],
        ['n12', 0xf1],
        ['n13', 0x83],
        ['n14', 0x87],
        ['wait', BEAT],
        ['n13', 0xc1],
        ['n14', 0x87],
        ['wait', BEAT],
        ['end'],
        // Commands after `end` are never compiled.
        ['n12', 0xff],
      ],
    },
    {
      id: 3,
      commands: [
        ['n1a', 0],
        ...waveRam,
        ['n1a', 0x80],
        ['n1c', 0x20],
        ['n1d', 0x00],
        ['n1e', 0x86],
        ['wait', 2 * BEAT],
      ],
    },
    {
      id: 4,
      commands: [
        ['sfx_priority', 1],
        ['stereo_panning', 0x88],
        ['n21', 'sn01'],
        ['n22', 'sn01'],
        ['n23', 0x80],
        ['wait', BEAT],
        ['n21', 'hh01'],
        ['n22', 'hh01'],
        ['n23', 0x80],
        ['wait', BEAT],
      ],
    },
  ],
}
