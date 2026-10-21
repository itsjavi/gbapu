import { describe, expect, it } from 'vitest'
import {
  encodeInterleavedStereoPcm16Wav,
  renderEngineAudioToPcm,
  renderEngineAudioToWavBlob,
} from '../src/index.ts'
import { waveTone } from './fixtures.ts'

const ascii = (view: DataView, offset: number, length: number) =>
  String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(offset + i)))

function expectPcm16StereoHeader(view: DataView, sampleRate: number, sampleCount: number) {
  expect(ascii(view, 0, 4)).toBe('RIFF')
  expect(ascii(view, 8, 4)).toBe('WAVE')
  expect(ascii(view, 12, 4)).toBe('fmt ')
  expect(view.getUint32(16, true)).toBe(16) // fmt chunk size
  expect(view.getUint16(20, true)).toBe(1) // PCM
  expect(view.getUint16(22, true)).toBe(2) // channels
  expect(view.getUint32(24, true)).toBe(sampleRate)
  expect(view.getUint32(28, true)).toBe(sampleRate * 4) // byte rate
  expect(view.getUint16(32, true)).toBe(4) // block align
  expect(view.getUint16(34, true)).toBe(16) // bits per sample
  expect(ascii(view, 36, 4)).toBe('data')
  expect(view.getUint32(40, true)).toBe(sampleCount * 2)
}

describe('encodeInterleavedStereoPcm16Wav', () => {
  it('writes a 44-byte PCM16 stereo header and two bytes per sample', () => {
    const { sampleRate, interleavedStereo } = renderEngineAudioToPcm(waveTone, { tailMs: 0 })
    const wav = encodeInterleavedStereoPcm16Wav(interleavedStereo, sampleRate)
    const view = new DataView(wav)
    expect(wav.byteLength).toBe(44 + interleavedStereo.length * 2)
    expect(view.getUint32(4, true)).toBe(wav.byteLength - 8)
    expectPcm16StereoHeader(view, sampleRate, interleavedStereo.length)
  })

  it('scales, rounds and clamps samples to 16 bits', () => {
    const wav = encodeInterleavedStereoPcm16Wav(new Float32Array([1, -1, 0, 0.5, 2, -2]), 8_000)
    const view = new DataView(wav)
    const samples = Array.from({ length: 6 }, (_, i) => view.getInt16(44 + i * 2, true))
    expect(samples).toEqual([32767, -32768, 0, 16384, 32767, -32768])
  })

  it('appends a smpl chunk with an inclusive loop end', () => {
    const pcm = new Float32Array(200)
    const wav = encodeInterleavedStereoPcm16Wav(pcm, 48_000, { start_frame: 10, end_frame: 100 })
    const view = new DataView(wav)
    const at = 44 + pcm.length * 2
    expect(wav.byteLength).toBe(at + 68)
    expect(view.getUint32(4, true)).toBe(wav.byteLength - 8)
    expect(ascii(view, at, 4)).toBe('smpl')
    expect(view.getUint32(at + 36, true)).toBe(1) // loop count
    expect(view.getUint32(at + 52, true)).toBe(10)
    expect(view.getUint32(at + 56, true)).toBe(99)
  })

  it('rejects invalid loops and non-finite samples', () => {
    const pcm = new Float32Array(20)
    for (const loop of [
      { start_frame: 5, end_frame: 5 },
      { start_frame: -1, end_frame: 5 },
      { start_frame: 0, end_frame: 11 },
      { start_frame: 0.5, end_frame: 5 },
    ]) {
      expect(() => encodeInterleavedStereoPcm16Wav(pcm, 48_000, loop)).toThrow(/Invalid WAV loop/)
    }
    expect(() => encodeInterleavedStereoPcm16Wav(new Float32Array([NaN, 0]), 48_000)).toThrow(
      /Non-finite/,
    )
  })
})

describe('renderEngineAudioToWavBlob', () => {
  it('returns an audio/wav Blob of the rendered PCM', async () => {
    const options = { sampleRate: 22_050, tailMs: 0 }
    const { interleavedStereo } = renderEngineAudioToPcm(waveTone, options)
    const blob = renderEngineAudioToWavBlob(waveTone, options)
    expect(blob.type).toBe('audio/wav')
    expect(blob.size).toBe(44 + interleavedStereo.length * 2)
    expectPcm16StereoHeader(
      new DataView(await blob.arrayBuffer()),
      22_050,
      interleavedStereo.length,
    )
  })
})
