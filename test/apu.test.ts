import { describe, expect, it } from 'vitest'
import { APU_REG, Apu, MIX_MODE } from '../src/index.ts'

const RATE = 48_000

/** Powers the APU on and starts a full-volume square wave on channel 1, left and right. */
function startPulse(apu: Apu) {
  apu.writeRegister(APU_REG.REG_NR52, 0x80, 0)
  apu.writeRegister(APU_REG.REG_NR50, 0x77, 0)
  apu.writeRegister(APU_REG.REG_NR51, 0x11, 0)
  apu.writeRegister(APU_REG.REG_NR11, 0x80, 0)
  apu.writeRegister(APU_REG.REG_NR12, 0xf0, 0)
  apu.writeRegister(APU_REG.REG_NR13, 0x00, 0)
  apu.writeRegister(APU_REG.REG_NR14, 0x87, 0)
}

function drain(apu: Apu): Float32Array {
  const pcm = new Float32Array(apu.availableSamples() * 2)
  expect(apu.readSamples(pcm, pcm.length / 2)).toBe(pcm.length / 2)
  return pcm
}

describe('Apu', () => {
  it('exposes the register map and mix modes', () => {
    expect(APU_REG.REG_NR10).toBe(0x10)
    expect(APU_REG.REG_NR52).toBe(0x26)
    expect(APU_REG.REG_WAVERAM).toBe(0x30)
    expect(MIX_MODE).toEqual({ mute: 0, left: 2, right: 1, middle: 3 })
  })

  it('produces samples for the cycles it steps through, once a frame ends', () => {
    const apu = new Apu(RATE, 8192)
    startPulse(apu)
    apu.step(4_194_304 / 10)
    expect(apu.availableSamples()).toBe(0)
    apu.endFrame()
    const pcm = drain(apu)
    expect(Math.abs(pcm.length / 2 - RATE / 10)).toBeLessThanOrEqual(1)
    expect(pcm.some((value) => Math.abs(value) > 0.01)).toBe(true)
    expect(apu.availableSamples()).toBe(0)
  })

  it('reports power and channel status in NR52', () => {
    const apu = new Apu(RATE, 8192)
    expect(apu.readRegister(APU_REG.REG_NR52, 0) & 0x80).toBe(0)
    startPulse(apu)
    expect(apu.readRegister(APU_REG.REG_NR52, 0) & 0x81).toBe(0x81)
  })

  it('pads processSamples with silence past the available samples', () => {
    const apu = new Apu(RATE, 8192)
    startPulse(apu)
    apu.step(10_000)
    apu.endFrame()
    const available = apu.availableSamples()
    const dest = new Float32Array((available + 50) * 2).fill(9)
    expect(apu.processSamples(dest, available + 50)).toBe(available)
    expect(dest.subarray(available * 2).every((value) => value === 0)).toBe(true)
  })

  it('clears queued samples and registers on reset, then replays identically', () => {
    const apu = new Apu(RATE, 8192)
    const run = () => {
      startPulse(apu)
      apu.step(419_430)
      apu.endFrame()
      return drain(apu)
    }
    const first = run()
    apu.step(100_000)
    apu.endFrame()
    expect(apu.availableSamples()).toBeGreaterThan(0)
    apu.reset()
    expect(apu.availableSamples()).toBe(0)
    expect(apu.readRegister(APU_REG.REG_NR52, 0) & 0x80).toBe(0)
    expect(run()).toEqual(first)
  })
})
