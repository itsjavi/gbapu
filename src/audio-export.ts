import { compileEngineAudio, type CompiledEngineAudioChannelTimeline } from './audio-compiler.ts'
import { APU_REG, Apu } from './apu.ts'
import type { EngineAudioData } from './types.ts'

const CPU_CYCLES_PER_SECOND = 4_194_304
const DEFAULT_SAMPLE_RATE = 48_000
const DEFAULT_APU_BUFFER_SAMPLES = 8192
const DEFAULT_END_FRAME_INTERVAL_CYCLES = Math.floor(CPU_CYCLES_PER_SECOND / 240)

type ExportChannelState = {
  timeline: CompiledEngineAudioChannelTimeline
  eventIndex: number
  loopEventIndex: number
  playheadCycles: number
  loopsRemaining: number
  ended: boolean
}

export type EngineAudioExportOptions = {
  sampleRate?: number
  loopCount?: number
  tailMs?: number
  /** Exact render horizon, continuously repeating all channels with source loops. */
  durationCycles?: number
}

export type EngineAudioRenderResult = {
  sampleRate: number
  interleavedStereo: Float32Array
}

export function renderEngineAudioToPcm(
  data: EngineAudioData,
  options: EngineAudioExportOptions = {},
): EngineAudioRenderResult {
  const sampleRate = normalizeSampleRate(options.sampleRate)
  const loopCount = Math.max(0, Math.floor(options.loopCount ?? 0))
  const tailMs = Math.max(0, options.tailMs ?? 120)
  const timeline = compileEngineAudio(data)
  const durationCycles = options.durationCycles
  if (
    durationCycles !== undefined &&
    (!Number.isSafeInteger(durationCycles) ||
      durationCycles <= 0 ||
      durationCycles > CPU_CYCLES_PER_SECOND * 900)
  ) {
    throw new Error('Invalid music render horizon')
  }
  if (
    timeline.totalCycles > CPU_CYCLES_PER_SECOND * (data.category === 'music' ? 900 : 600) ||
    loopCount > 16 ||
    tailMs > 5000
  ) {
    throw new Error('Audio exceeds offline rendering limits')
  }
  const apu = new Apu(sampleRate, DEFAULT_APU_BUFFER_SAMPLES)
  const endFrameIntervalCycles = DEFAULT_END_FRAME_INTERVAL_CYCLES
  const channelStates = timeline.channels.map((channel) => {
    const loopEventIndex =
      channel.loopStartCycle === null
        ? -1
        : findFirstEventAtOrAfter(channel.events, channel.loopStartCycle)
    return {
      timeline: channel,
      eventIndex: 0,
      loopEventIndex,
      playheadCycles: 0,
      loopsRemaining:
        channel.loopStartCycle === null ? 0 : durationCycles === undefined ? loopCount : Infinity,
      ended: false,
    } satisfies ExportChannelState
  })

  const chunks: Float32Array[] = []
  let totalSamples = 0
  let pendingFrameCycles = 0

  bootApu(apu)
  let safetyCounter = 0
  let renderedCycles = 0
  while (true) {
    // Do not mute or trigger boundary events past the end of a loopable buffer.
    if (durationCycles !== undefined && renderedCycles >= durationCycles) break
    if (safetyCounter > 5_000_000) {
      throw new Error(`Audio export did not converge for ${data.id}`)
    }
    safetyCounter += 1

    const progressedViaEvents = emitDueChannelEvents(apu, channelStates)
    if (!hasActiveChannels(channelStates)) {
      break
    }

    const step = Math.min(
      computeNextStep(channelStates),
      durationCycles === undefined ? Infinity : durationCycles - renderedCycles,
    )
    if (step <= 0) {
      if (!progressedViaEvents) {
        break
      }
      continue
    }

    advanceChannels(channelStates, step)
    renderedCycles += step
    const flushed = runCyclesWithPeriodicFrameFlush(
      apu,
      step,
      pendingFrameCycles,
      endFrameIntervalCycles,
      chunks,
    )
    pendingFrameCycles = flushed.pendingFrameCycles
    totalSamples += flushed.samplesDrained
  }

  if (pendingFrameCycles > 0) {
    apu.endFrame()
    totalSamples += drainApuSamples(apu, chunks)
    pendingFrameCycles = 0
  }

  const tailCycles = Math.floor((tailMs / 1000) * CPU_CYCLES_PER_SECOND)
  if (tailCycles > 0) {
    const tailFlushed = runCyclesWithPeriodicFrameFlush(
      apu,
      tailCycles,
      pendingFrameCycles,
      endFrameIntervalCycles,
      chunks,
    )
    pendingFrameCycles = tailFlushed.pendingFrameCycles
    totalSamples += tailFlushed.samplesDrained
  }

  if (pendingFrameCycles > 0) {
    apu.endFrame()
    totalSamples += drainApuSamples(apu, chunks)
  }

  return {
    sampleRate,
    interleavedStereo: flattenChunks(chunks, totalSamples),
  }
}

export function renderEngineAudioToWavBlob(
  data: EngineAudioData,
  options: EngineAudioExportOptions = {},
): Blob {
  const rendered = renderEngineAudioToPcm(data, options)
  const wavBuffer = encodeInterleavedStereoPcm16Wav(rendered.interleavedStereo, rendered.sampleRate)
  return new Blob([wavBuffer], { type: 'audio/wav' })
}

function normalizeSampleRate(sampleRate: number | undefined): number {
  if (sampleRate === undefined || !Number.isFinite(sampleRate)) {
    return DEFAULT_SAMPLE_RATE
  }
  return Math.max(8_000, Math.floor(sampleRate))
}

function emitDueChannelEvents(apu: Apu, channelStates: readonly ExportChannelState[]): boolean {
  let progressed = false

  for (const channelState of channelStates) {
    while (!channelState.ended) {
      const { timeline } = channelState
      const nextEvent = timeline.events[channelState.eventIndex] ?? null
      // Finite source wave ClearChannel writes occur at the exact end cycle.
      // Loop boundaries and explicit render horizons retain their prior behavior.
      const waveEndpointEvent =
        timeline.channelId === 3 &&
        timeline.loopStartCycle === null &&
        nextEvent !== null &&
        nextEvent.cycle === channelState.playheadCycles

      if (channelState.playheadCycles >= timeline.totalCycles && !waveEndpointEvent) {
        if (timeline.loopStartCycle === null || channelState.loopsRemaining <= 0) {
          const muteRegister = { 1: 0x12, 2: 0x17, 3: 0x1c, 4: 0x21 }[timeline.channelId]
          if (!hasTerminalWaveClear(timeline)) apu.writeRegister(muteRegister, 0, 0)
          channelState.ended = true
          progressed = true
          break
        }

        channelState.playheadCycles = timeline.loopStartCycle
        channelState.eventIndex = channelState.loopEventIndex
        channelState.loopsRemaining -= 1
        progressed = true
        continue
      }

      if (!nextEvent || nextEvent.cycle !== channelState.playheadCycles) {
        break
      }

      // NR51 commands route only their own channel; preserve simultaneous tracks.
      if (nextEvent.register === 0x25) {
        const bit = 1 << (timeline.channelId - 1)
        const mask = bit | (bit << 4)
        const current = apu.readRegister(0x25, 0)
        apu.writeRegister(0x25, (current & ~mask) | (nextEvent.value & mask), 0)
      } else {
        apu.writeRegister(nextEvent.register, nextEvent.value, 0)
      }
      channelState.eventIndex += 1
      progressed = true
    }
  }

  return progressed
}

function hasTerminalWaveClear(timeline: CompiledEngineAudioChannelTimeline): boolean {
  if (timeline.channelId !== 3 || timeline.loopStartCycle !== null) return false
  const clear = [
    [0x1a, 0],
    [0x1b, 0],
    [0x1c, 8],
    [0x1d, 0],
    [0x1e, 128],
  ]
  return (
    timeline.events.slice(-5).length === 5 &&
    timeline.events
      .slice(-5)
      .every(
        (event, index) =>
          event.cycle === timeline.totalCycles &&
          event.register === clear[index][0] &&
          event.value === clear[index][1],
      )
  )
}

function hasActiveChannels(channelStates: readonly ExportChannelState[]): boolean {
  for (const channelState of channelStates) {
    if (channelState.ended) {
      continue
    }

    const { timeline } = channelState
    if (channelState.eventIndex < timeline.events.length) {
      return true
    }

    if (channelState.playheadCycles < timeline.totalCycles) {
      return true
    }

    if (timeline.loopStartCycle !== null && channelState.loopsRemaining > 0) {
      return true
    }
  }

  return false
}

function computeNextStep(channelStates: readonly ExportChannelState[]): number {
  let step = Number.POSITIVE_INFINITY

  for (const channelState of channelStates) {
    if (channelState.ended) {
      continue
    }

    const { timeline } = channelState
    if (channelState.playheadCycles >= timeline.totalCycles) {
      if (timeline.loopStartCycle !== null && channelState.loopsRemaining > 0) {
        return 0
      }
      continue
    }

    const nextEvent = timeline.events[channelState.eventIndex] ?? null
    if (nextEvent) {
      const delta = nextEvent.cycle - channelState.playheadCycles
      step = Math.min(step, Math.max(0, delta))
      continue
    }

    step = Math.min(step, Math.max(0, timeline.totalCycles - channelState.playheadCycles))
  }

  if (!Number.isFinite(step)) {
    return 0
  }
  return step
}

function advanceChannels(channelStates: readonly ExportChannelState[], stepCycles: number): void {
  for (const channelState of channelStates) {
    if (channelState.ended) {
      continue
    }

    let remaining = stepCycles
    while (remaining > 0 && !channelState.ended) {
      const { timeline } = channelState

      if (channelState.playheadCycles >= timeline.totalCycles) {
        if (timeline.loopStartCycle === null || channelState.loopsRemaining <= 0) {
          channelState.ended = true
          break
        }

        channelState.playheadCycles = timeline.loopStartCycle
        channelState.eventIndex = channelState.loopEventIndex
        channelState.loopsRemaining -= 1
        continue
      }

      const toBoundary = timeline.totalCycles - channelState.playheadCycles
      if (remaining < toBoundary) {
        channelState.playheadCycles += remaining
        remaining = 0
        break
      }

      channelState.playheadCycles = timeline.totalCycles
      remaining -= toBoundary
    }
  }
}

function drainApuSamples(apu: Apu, chunks: Float32Array[]): number {
  let drainedSamples = 0
  while (apu.availableSamples() > 0) {
    const available = apu.availableSamples()
    const chunk = new Float32Array(available * 2)
    const samplesRead = apu.readSamples(chunk, available)
    if (samplesRead <= 0) {
      break
    }
    if (samplesRead * 2 === chunk.length) {
      chunks.push(chunk)
    } else {
      chunks.push(chunk.subarray(0, samplesRead * 2))
    }
    drainedSamples += samplesRead
  }
  return drainedSamples
}

function runCyclesWithPeriodicFrameFlush(
  apu: Apu,
  cycles: number,
  pendingFrameCycles: number,
  endFrameIntervalCycles: number,
  chunks: Float32Array[],
): { pendingFrameCycles: number; samplesDrained: number } {
  let remainingCycles = cycles
  let localPendingFrameCycles = pendingFrameCycles
  let samplesDrained = 0

  while (remainingCycles > 0) {
    const cyclesUntilFlush = Math.max(1, endFrameIntervalCycles - localPendingFrameCycles)
    const chunkCycles = Math.min(remainingCycles, cyclesUntilFlush)
    apu.step(chunkCycles)
    localPendingFrameCycles += chunkCycles
    remainingCycles -= chunkCycles

    if (localPendingFrameCycles >= endFrameIntervalCycles) {
      apu.endFrame()
      samplesDrained += drainApuSamples(apu, chunks)
      localPendingFrameCycles = 0
    }
  }

  return {
    pendingFrameCycles: localPendingFrameCycles,
    samplesDrained,
  }
}

function flattenChunks(chunks: readonly Float32Array[], sampleCount: number): Float32Array {
  const result = new Float32Array(sampleCount * 2)
  let offset = 0

  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }

  return result
}

export function encodeInterleavedStereoPcm16Wav(
  interleavedStereo: Float32Array,
  sampleRate: number,
  loop?: { start_frame: number; end_frame: number },
): ArrayBuffer {
  const channels = 2
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const blockAlign = channels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = interleavedStereo.length * bytesPerSample
  const frameCount = interleavedStereo.length / 2
  if (
    loop &&
    (!Number.isInteger(loop.start_frame) ||
      !Number.isInteger(loop.end_frame) ||
      loop.start_frame < 0 ||
      loop.end_frame > frameCount ||
      loop.start_frame >= loop.end_frame)
  )
    throw new Error('Invalid WAV loop')
  const buffer = new ArrayBuffer(44 + dataSize + (loop ? 68 : 0))
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, buffer.byteLength - 8, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < interleavedStereo.length; i += 1) {
    if (!Number.isFinite(interleavedStereo[i])) throw new Error('Non-finite PCM sample')
    const clamped = Math.max(-1, Math.min(1, interleavedStereo[i]))
    const pcm = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff)
    view.setInt16(offset, pcm, true)
    offset += 2
  }

  if (loop) {
    const at = 44 + dataSize
    writeAscii(view, at, 'smpl')
    view.setUint32(at + 4, 60, true)
    view.setUint32(at + 16, Math.round(1_000_000_000 / sampleRate), true)
    view.setUint32(at + 20, 60, true)
    view.setUint32(at + 36, 1, true)
    view.setUint32(at + 52, loop.start_frame, true)
    view.setUint32(at + 56, loop.end_frame - 1, true) // RIFF uses an inclusive last sample.
  }

  return buffer
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i))
  }
}

function findFirstEventAtOrAfter(events: readonly { cycle: number }[], cycle: number): number {
  for (let index = 0; index < events.length; index += 1) {
    if (events[index].cycle >= cycle) {
      return index
    }
  }
  return events.length
}

function bootApu(apu: Apu): void {
  apu.writeRegister(APU_REG.REG_NR52, 0x00, 0)
  apu.writeRegister(APU_REG.REG_NR52, 0x80, 0)
  apu.writeRegister(APU_REG.REG_NR50, 0x77, 0)
  apu.writeRegister(APU_REG.REG_NR51, 0xff, 0)
}
