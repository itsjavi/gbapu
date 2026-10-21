import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { renderEngineAudioToPcm, type EngineAudioData } from '../src/index.ts'
import { BEAT, CPU_HZ, TENTH, noiseHit, pulseTone, song, waveTone } from './fixtures.ts'

const RATE = 48_000

const hash = (pcm: Float32Array) =>
  createHash('sha256')
    .update(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength))
    .digest('hex')

const render = (data: EngineAudioData, options = {}) =>
  renderEngineAudioToPcm(data, { sampleRate: RATE, tailMs: 0, ...options })

/** Stereo frames that `cycles` CPU cycles produce at the test sample rate. */
const frames = (cycles: number) => (cycles / CPU_HZ) * RATE

const left = (pcm: Float32Array) => pcm.filter((_, i) => i % 2 === 0)
const right = (pcm: Float32Array) => pcm.filter((_, i) => i % 2 === 1)

describe('renderEngineAudioToPcm', () => {
  it('renders identical samples for the same input', () => {
    const hashes = new Set<string>()
    for (const sound of [pulseTone(0x783), waveTone, noiseHit, song]) {
      const first = render(sound).interleavedStereo
      const second = render(sound).interleavedStereo
      expect(second.length).toBe(first.length)
      expect(hash(second)).toBe(hash(first))
      hashes.add(hash(first))
    }
    expect(hashes.size).toBe(4)
  })

  it('renders finite, bounded and audible samples for each channel type', () => {
    for (const sound of [pulseTone(0x783), waveTone, noiseHit]) {
      const { sampleRate, interleavedStereo } = render(sound)
      expect(sampleRate).toBe(RATE)
      expect(Math.abs(interleavedStereo.length / 2 - frames(TENTH))).toBeLessThanOrEqual(2)
      expect(interleavedStereo.every(Number.isFinite)).toBe(true)
      expect(interleavedStereo.every((value) => Math.abs(value) < 1)).toBe(true)
      expect(interleavedStereo.some((value) => Math.abs(value) > 0.01)).toBe(true)
    }
  })

  it('plays a pulse wave at the pitch of its frequency register', () => {
    // Pulse channels play 131072 / (2048 - x) Hz: x = 1750 is 439.8 Hz (A4).
    const x = 1750
    const seconds = 0.5
    const pcm = render(pulseTone(x, CPU_HZ * seconds)).interleavedStereo
    const samples = left(pcm).slice(RATE * 0.05) // skip the attack
    let rising = 0
    for (let i = 1; i < samples.length; i += 1) {
      if (samples[i - 1]! < 0 && samples[i]! >= 0) rising += 1
    }
    const measured = rising / (samples.length / RATE)
    expect(measured).toBeGreaterThan(437)
    expect(measured).toBeLessThan(443)
  })

  it('routes a channel through NR51 and silences everything when NR52 is off', () => {
    const tone = pulseTone(0x783)
    const commands = tone.channels[0]!.commands
    const leftOnly = { ...tone, channels: [{ id: 1, commands: [['n25', 0x10], ...commands] }] }
    const pcm = render(leftOnly as EngineAudioData).interleavedStereo
    expect(left(pcm).some((value) => Math.abs(value) > 0.01)).toBe(true)
    expect(right(pcm).every((value) => value === 0)).toBe(true)

    const poweredOff = { ...tone, channels: [{ id: 1, commands: [['n26', 0], ...commands] }] }
    expect(render(poweredOff as EngineAudioData).interleavedStereo.every((v) => v === 0)).toBe(true)
  })

  it('repeats the loop section loopCount extra times', () => {
    const once = render(song).interleavedStereo.length / 2
    const looped = render(song, { loopCount: 2 }).interleavedStereo.length / 2
    expect(Math.abs(once - frames(2 * BEAT))).toBeLessThanOrEqual(2)
    // Channel 1 loops over its second beat: two more passes add two beats.
    expect(Math.abs(looped - frames(4 * BEAT))).toBeLessThanOrEqual(2)
  })

  it('renders exactly durationCycles, looping until the horizon', () => {
    const { interleavedStereo } = render(song, { durationCycles: CPU_HZ })
    expect(Math.abs(interleavedStereo.length / 2 - RATE)).toBeLessThanOrEqual(1)
  })

  it('appends tailMs of release after the last command', () => {
    const plain = render(noiseHit).interleavedStereo.length / 2
    const tailed = render(noiseHit, { tailMs: 250 }).interleavedStereo.length / 2
    expect(Math.abs(tailed - plain - RATE * 0.25)).toBeLessThanOrEqual(2)
  })

  it('rejects renders past its limits', () => {
    expect(() => render(song, { durationCycles: 0 })).toThrow(/Invalid music render horizon/)
    expect(() => render(song, { loopCount: 17 })).toThrow(/offline rendering limits/)
    expect(() => render(song, { tailMs: 5001 })).toThrow(/offline rendering limits/)
  })
})
