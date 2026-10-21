import { describe, expect, it } from 'vitest'
import {
  AUDIO_DRUM_TOKEN_TO_VALUES,
  audioRegisterTokenFromValue,
  audioValueTokenFromRegisterValue,
  compileEngineAudio,
  resolveAudioRegister,
  resolveAudioValue,
  type CompiledEngineAudioChannelTimeline,
  type EngineAudioValueToken,
} from '../src/index.ts'
import { BEAT, song } from './fixtures.ts'

const writes = (channel: CompiledEngineAudioChannelTimeline) =>
  channel.events.map((event) => [event.cycle, event.register, event.value])

describe('compileEngineAudio', () => {
  const timeline = compileEngineAudio(song)
  const [pulse, wave, noise] = timeline.channels

  it('compiles each channel into a timeline of register writes', () => {
    expect(timeline.totalCycles).toBe(2 * BEAT)
    expect(timeline.channels.map((channel) => channel.channelId)).toEqual([1, 3, 4])
    expect(timeline.channels.map((channel) => channel.totalCycles)).toEqual([
      2 * BEAT,
      2 * BEAT,
      2 * BEAT,
    ])
    for (const channel of timeline.channels) {
      expect(channel.events.every((event) => event.channelId === channel.channelId)).toBe(true)
    }
  })

  it('places writes at the cycle of the waits before them and stops at end', () => {
    expect(writes(pulse!)).toEqual([
      [0, 0x11, 0x80],
      [0, 0x12, 0xf1],
      [0, 0x13, 0x83],
      [0, 0x14, 0x87],
      [BEAT, 0x13, 0xc1],
      [BEAT, 0x14, 0x87],
    ])
  })

  it('records the loop start as a cycle', () => {
    expect(pulse!.loopStartCycle).toBe(BEAT)
    expect(wave!.loopStartCycle).toBeNull()
  })

  it('writes the 16 wave RAM bytes before the wave note', () => {
    const ram = wave!.events.filter((event) => event.register >= 0x30 && event.register <= 0x3f)
    expect(ram.map((event) => event.value)).toEqual(Array.from({ length: 16 }, (_, i) => i * 17))
    expect(wave!.events.at(-1)).toMatchObject({ cycle: 0, register: 0x1e, value: 0x86 })
  })

  it('resolves drum value tokens and turns panning into an NR51 write', () => {
    expect(writes(noise!)).toEqual([
      [0, 0x25, 0x88],
      [0, 0x21, AUDIO_DRUM_TOKEN_TO_VALUES.sn01.n21],
      [0, 0x22, AUDIO_DRUM_TOKEN_TO_VALUES.sn01.n22],
      [0, 0x23, 0x80],
      [BEAT, 0x21, AUDIO_DRUM_TOKEN_TO_VALUES.hh01.n21],
      [BEAT, 0x22, AUDIO_DRUM_TOKEN_TO_VALUES.hh01.n22],
      [BEAT, 0x23, 0x80],
    ])
  })

  it('keeps driver controls apart from register writes', () => {
    expect(pulse!.controls).toEqual([{ cycle: 0, commandIndex: 0, kind: 'tempo', value: 120 }])
    expect(noise!.controls).toEqual([
      { cycle: 0, commandIndex: 0, kind: 'sfx_priority', value: 1 },
      { cycle: 0, commandIndex: 1, kind: 'panning', value: 0x88 },
    ])
  })
})

describe('command tokens', () => {
  it('maps register tokens to the low byte of their $FFxx address and back', () => {
    expect(resolveAudioRegister('n10')).toBe(0x10)
    expect(resolveAudioRegister('n26')).toBe(0x26)
    expect(resolveAudioRegister('w3f')).toBe(0x3f)
    expect(audioRegisterTokenFromValue(0x1e)).toBe('n1e')
    expect(audioRegisterTokenFromValue(0x15)).toBeNull()
  })

  it('masks raw values to a byte and resolves drum tokens for NR42 and NR43 only', () => {
    expect(resolveAudioValue('n12', 0x1f3)).toBe(0xf3)
    expect(resolveAudioValue('n21', 'ki01')).toBe(0x80)
    expect(resolveAudioValue('n22', 'ki01')).toBe(0x6b)
    expect(() => resolveAudioValue('n12', 'ki01')).toThrow(/only valid for n21 or n22/)
    expect(() => resolveAudioValue('n21', 'nope' as EngineAudioValueToken)).toThrow(/Unknown/)
  })

  it('names a drum value only when exactly one token has it', () => {
    const tokens = Object.entries(AUDIO_DRUM_TOKEN_TO_VALUES)
    for (const register of ['n21', 'n22'] as const) {
      for (const [, values] of tokens) {
        const value = values[register]
        const owners = tokens.filter(([, other]) => other[register] === value).map(([t]) => t)
        const named = audioValueTokenFromRegisterValue(resolveAudioRegister(register), value)
        expect(named).toBe(owners.length === 1 ? owners[0] : null)
      }
    }
    expect(audioValueTokenFromRegisterValue(0x12, 0xc1)).toBeNull()
  })
})
