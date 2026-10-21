const MAX_FREQUENCY = 2047
const WAVE_RAMSIZE = 16
const CLOCK_SPEED = 4_194_304

const MIX_LEFT = 2
const MIX_RIGHT = 1

export const MIX_MODE = {
  mute: 0,
  left: MIX_LEFT,
  right: MIX_RIGHT,
  middle: MIX_LEFT | MIX_RIGHT,
} as const

type MixMode = (typeof MIX_MODE)[keyof typeof MIX_MODE]
type ChannelMix = [MixMode, MixMode, MixMode, MixMode]

type AudioBufferTarget = Float32Array | number[]

type Trigger = {
  nextIndex: number
  nextPeriod: number
  type: number
}

const TRIGGER_TYPE = {
  lcSweep: 0,
  lc: 1,
  env: 2,
} as const

const PHASES = 32
const STEP_WIDTH = 16

const CYCLES_PER_STEP = 8192
const SEQUENCER_DEFAULT_PERIOD = CYCLES_PER_STEP * 2

const LFSR_INIT = 0x7fff
const NOISE_DEFAULT_PERIOD = 8

const PULSE_MULTIPLIER = 4
const DUTY_MASK = 0x7ee18180
const PULSE_DEFAULT_PERIOD = (2048 - 0) * PULSE_MULTIPLIER

const WAVE_MULTIPLIER = 2
const WAVE_DEFAULT_PERIOD = (2048 - 0) * WAVE_MULTIPLIER

const TRIGGER_SEQUENCE: readonly Trigger[] = [
  { nextIndex: 1, nextPeriod: CYCLES_PER_STEP * 2, type: TRIGGER_TYPE.lc },
  { nextIndex: 2, nextPeriod: CYCLES_PER_STEP * 2, type: TRIGGER_TYPE.lcSweep },
  { nextIndex: 3, nextPeriod: CYCLES_PER_STEP, type: TRIGGER_TYPE.lc },
  { nextIndex: 4, nextPeriod: CYCLES_PER_STEP, type: TRIGGER_TYPE.lcSweep },
  { nextIndex: 0, nextPeriod: CYCLES_PER_STEP * 2, type: TRIGGER_TYPE.env },
]

const STEP_TABLE: readonly (readonly number[])[] = [
  [
    0.001312256, -0.003509521, 0.010681152, -0.014892578, 0.034667969, -0.027893066, 0.178863525,
    0.641540527, 0.178863525, -0.027893066, 0.034667969, -0.014892578, 0.010681152, -0.003509521,
    0.001312256, 0.0,
  ],
  [
    0.001342773, -0.003601074, 0.010620117, -0.014434814, 0.032836914, -0.024383545, 0.160949707,
    0.640899658, 0.197265625, -0.031158447, 0.036315918, -0.015228271, 0.010681152, -0.003356934,
    0.001220703, 0.000030518,
  ],
  [
    0.001373291, -0.003692627, 0.010498047, -0.01385498, 0.030853271, -0.0206604, 0.143615723,
    0.638916016, 0.216125488, -0.03414917, 0.037780762, -0.015441895, 0.0105896, -0.003112793,
    0.001068115, 0.000091553,
  ],
  [
    0.001403809, -0.003723145, 0.010253906, -0.013153076, 0.028747559, -0.01675415, 0.126831055,
    0.635650635, 0.23538208, -0.036773682, 0.039001465, -0.015472412, 0.010406494, -0.002868652,
    0.000946045, 0.00012207,
  ],
  [
    0.001434326, -0.003753662, 0.009979248, -0.012329102, 0.026489258, -0.012756348, 0.110748291,
    0.631072998, 0.254974365, -0.0390625, 0.040039063, -0.015380859, 0.010162354, -0.002593994,
    0.000793457, 0.000183105,
  ],
  [
    0.001434326, -0.003723145, 0.009643555, -0.011444092, 0.024169922, -0.00869751, 0.095336914,
    0.625244141, 0.274810791, -0.040863037, 0.040802002, -0.015136719, 0.00982666, -0.002288818,
    0.000671387, 0.000213623,
  ],
  [
    0.001434326, -0.003662109, 0.009246826, -0.010498047, 0.021789551, -0.004608154, 0.080688477,
    0.618164063, 0.294799805, -0.042205811, 0.041320801, -0.01473999, 0.009429932, -0.001922607,
    0.000488281, 0.000274658,
  ],
  [
    0.001403809, -0.003570557, 0.00881958, -0.009460449, 0.019348145, -0.000518799, 0.066772461,
    0.609893799, 0.314910889, -0.043029785, 0.041564941, -0.014160156, 0.008911133, -0.001495361,
    0.000274658, 0.000335693,
  ],
  [
    0.001403809, -0.003479004, 0.008331299, -0.008392334, 0.016876221, 0.003570557, 0.053649902,
    0.60043335, 0.33505249, -0.043304443, 0.041534424, -0.013397217, 0.008300781, -0.001068115,
    0.000091553, 0.000396729,
  ],
  [
    0.001342773, -0.003295898, 0.007781982, -0.007232666, 0.014373779, 0.007537842, 0.041381836,
    0.589813232, 0.355163574, -0.04296875, 0.041229248, -0.012512207, 0.007629395, -0.000579834,
    -0.00012207, 0.000457764,
  ],
  [
    0.001312256, -0.003143311, 0.007232666, -0.006072998, 0.011901855, 0.011383057, 0.029937744,
    0.578125, 0.375152588, -0.041992188, 0.040618896, -0.011444092, 0.006896973, -0.000091553,
    -0.000366211, 0.000549316,
  ],
  [
    0.001281738, -0.002990723, 0.006652832, -0.004882813, 0.009460449, 0.015106201, 0.019317627,
    0.56539917, 0.394958496, -0.040344238, 0.039703369, -0.010223389, 0.006072998, 0.000488281,
    -0.000610352, 0.000610352,
  ],
  [
    0.001220703, -0.0027771, 0.00604248, -0.003692627, 0.007049561, 0.01864624, 0.00958252,
    0.551696777, 0.414489746, -0.037963867, 0.038482666, -0.008850098, 0.005187988, 0.001037598,
    -0.000823975, 0.000671387,
  ],
  [
    0.001159668, -0.002563477, 0.005432129, -0.002471924, 0.004669189, 0.022033691, 0.000671387,
    0.537078857, 0.433654785, -0.034851074, 0.036956787, -0.007293701, 0.004241943, 0.001617432,
    -0.001098633, 0.000762939,
  ],
  [
    0.001098633, -0.002319336, 0.00479126, -0.001312256, 0.002441406, 0.025146484, -0.007354736,
    0.521606445, 0.452392578, -0.030975342, 0.03515625, -0.005615234, 0.003234863, 0.002227783,
    -0.001342773, 0.000823975,
  ],
  [
    0.001037598, -0.002075195, 0.004119873, -0.000091553, 0.000244141, 0.028045654, -0.014526367,
    0.505310059, 0.47064209, -0.026306152, 0.033050537, -0.003753662, 0.00213623, 0.002868652,
    -0.001586914, 0.00088501,
  ],
  [
    0.000976563, -0.001861572, 0.003509521, 0.001037598, -0.001831055, 0.030700684, -0.020843506,
    0.488311768, 0.488311768, -0.020843506, 0.030700684, -0.001831055, 0.001037598, 0.003509521,
    -0.001861572, 0.000976563,
  ],
  [
    0.00088501, -0.001586914, 0.002868652, 0.00213623, -0.003753662, 0.033050537, -0.026306152,
    0.47064209, 0.505310059, -0.014526367, 0.028045654, 0.000244141, -0.000091553, 0.004119873,
    -0.002075195, 0.001037598,
  ],
  [
    0.000823975, -0.001342773, 0.002227783, 0.003234863, -0.005615234, 0.03515625, -0.030975342,
    0.452392578, 0.521606445, -0.007354736, 0.025146484, 0.002441406, -0.001312256, 0.00479126,
    -0.002319336, 0.001098633,
  ],
  [
    0.000762939, -0.001098633, 0.001617432, 0.004241943, -0.007293701, 0.036956787, -0.034851074,
    0.433654785, 0.537078857, 0.000671387, 0.022033691, 0.004669189, -0.002471924, 0.005432129,
    -0.002563477, 0.001159668,
  ],
  [
    0.000671387, -0.000823975, 0.001037598, 0.005187988, -0.008850098, 0.038482666, -0.037963867,
    0.414489746, 0.551696777, 0.00958252, 0.01864624, 0.007049561, -0.003692627, 0.00604248,
    -0.0027771, 0.001220703,
  ],
  [
    0.000610352, -0.000610352, 0.000488281, 0.006072998, -0.010223389, 0.039703369, -0.040344238,
    0.394958496, 0.56539917, 0.019317627, 0.015106201, 0.009460449, -0.004882813, 0.006652832,
    -0.002990723, 0.001281738,
  ],
  [
    0.000549316, -0.000366211, -0.000091553, 0.006896973, -0.011444092, 0.040618896, -0.041992188,
    0.375152588, 0.578125, 0.029937744, 0.011383057, 0.011901855, -0.006072998, 0.007232666,
    -0.003143311, 0.001312256,
  ],
  [
    0.000457764, -0.00012207, -0.000579834, 0.007629395, -0.012512207, 0.041229248, -0.04296875,
    0.355163574, 0.589813232, 0.041381836, 0.007537842, 0.014373779, -0.007232666, 0.007781982,
    -0.003295898, 0.001342773,
  ],
  [
    0.000396729, 0.000091553, -0.001068115, 0.008300781, -0.013397217, 0.041534424, -0.043304443,
    0.33505249, 0.60043335, 0.053649902, 0.003570557, 0.016876221, -0.008392334, 0.008331299,
    -0.003479004, 0.001403809,
  ],
  [
    0.000335693, 0.000274658, -0.001495361, 0.008911133, -0.014160156, 0.041564941, -0.043029785,
    0.314910889, 0.609893799, 0.066772461, -0.000518799, 0.019348145, -0.009460449, 0.00881958,
    -0.003570557, 0.001403809,
  ],
  [
    0.000274658, 0.000488281, -0.001922607, 0.009429932, -0.01473999, 0.041320801, -0.042205811,
    0.294799805, 0.618164063, 0.080688477, -0.004608154, 0.021789551, -0.010498047, 0.009246826,
    -0.003662109, 0.001434326,
  ],
  [
    0.000213623, 0.000671387, -0.002288818, 0.00982666, -0.015136719, 0.040802002, -0.040863037,
    0.274810791, 0.625244141, 0.095336914, -0.00869751, 0.024169922, -0.011444092, 0.009643555,
    -0.003723145, 0.001434326,
  ],
  [
    0.000183105, 0.000793457, -0.002593994, 0.010162354, -0.015380859, 0.040039063, -0.0390625,
    0.254974365, 0.631072998, 0.110748291, -0.012756348, 0.026489258, -0.012329102, 0.009979248,
    -0.003753662, 0.001434326,
  ],
  [
    0.00012207, 0.000946045, -0.002868652, 0.010406494, -0.015472412, 0.039001465, -0.036773682,
    0.23538208, 0.635650635, 0.126831055, -0.01675415, 0.028747559, -0.013153076, 0.010253906,
    -0.003723145, 0.001403809,
  ],
  [
    0.000091553, 0.001068115, -0.003112793, 0.0105896, -0.015441895, 0.037780762, -0.03414917,
    0.216125488, 0.638916016, 0.143615723, -0.0206604, 0.030853271, -0.01385498, 0.010498047,
    -0.003692627, 0.001373291,
  ],
  [
    0.000030518, 0.001220703, -0.003356934, 0.010681152, -0.015228271, 0.036315918, -0.031158447,
    0.197265625, 0.640899658, 0.160949707, -0.024383545, 0.032836914, -0.014434814, 0.010620117,
    -0.003601074, 0.001342773,
  ],
  // extra step! this step is just the first one reversed
  [
    0.0, 0.001312256, -0.003509521, 0.010681152, -0.014892578, 0.034667969, -0.027893066,
    0.178863525, 0.641540527, 0.178863525, -0.027893066, 0.034667969, -0.014892578, 0.010681152,
    -0.003509521, 0.001312256,
  ],
]

export const APU_REG = {
  REG_NR10: 0x10,
  REG_NR11: 0x11,
  REG_NR12: 0x12,
  REG_NR13: 0x13,
  REG_NR14: 0x14,
  REG_UNUSED1: 0x15,
  REG_NR21: 0x16,
  REG_NR22: 0x17,
  REG_NR23: 0x18,
  REG_NR24: 0x19,
  REG_NR30: 0x1a,
  REG_NR31: 0x1b,
  REG_NR32: 0x1c,
  REG_NR33: 0x1d,
  REG_NR34: 0x1e,
  REG_UNUSED2: 0x1f,
  REG_NR41: 0x20,
  REG_NR42: 0x21,
  REG_NR43: 0x22,
  REG_NR44: 0x23,
  REG_NR50: 0x24,
  REG_NR51: 0x25,
  REG_NR52: 0x26,
  REG_WAVERAM: 0x30,
} as const

function modePansLeft(mode: MixMode): boolean {
  return (mode & MIX_LEFT) !== 0
}

function modePansRight(mode: MixMode): boolean {
  return (mode & MIX_RIGHT) !== 0
}

function dutyWaveform(duty: number): number {
  return (DUTY_MASK >> (duty << 3)) & 0xff
}

function isWaveRamRegister(reg: number): boolean {
  return reg >= APU_REG.REG_WAVERAM && reg < APU_REG.REG_WAVERAM + WAVE_RAMSIZE
}

class Timer {
  private mCounter: number
  private mPeriod: number

  constructor(initPeriod: number) {
    this.mCounter = initPeriod
    this.mPeriod = initPeriod
  }

  counter(): number {
    return this.mCounter
  }

  period(): number {
    return this.mPeriod
  }

  run(cycles: number): boolean {
    if (cycles > this.mCounter) {
      throw new RangeError('timer underflow')
    }
    this.mCounter -= cycles
    if (this.mCounter === 0) {
      this.mCounter = this.mPeriod
      return true
    }
    return false
  }

  fastforward(cycles: number): number {
    if (cycles < this.mCounter) {
      this.mCounter -= cycles
      return 0
    }
    const remain = cycles - this.mCounter
    const clocks = Math.floor(remain / this.mPeriod) + 1
    this.mCounter = this.mPeriod - (remain % this.mPeriod)
    return clocks
  }

  restart(): void {
    this.mCounter = this.mPeriod
  }

  setPeriod(period: number): void {
    this.mPeriod = period
  }
}

class Channel {
  protected mFrequency = 0
  protected mOutput = 0

  private mDacOn = false
  private mEnabled = false
  private readonly mTimer: Timer

  constructor(initPeriod: number) {
    this.mTimer = new Timer(initPeriod)
  }

  isDacOn(): boolean {
    return this.mDacOn
  }

  isEnabled(): boolean {
    return this.mEnabled
  }

  disable(): void {
    this.mEnabled = false
  }

  setDacEnabled(enabled: boolean): void {
    this.mDacOn = enabled
    if (!enabled) {
      this.disable()
    }
  }

  frequency(): number {
    return this.mFrequency
  }

  output(): number {
    return this.mOutput
  }

  timer(): Timer {
    return this.mTimer
  }

  reset(): void {
    this.mDacOn = false
    this.mEnabled = false
    this.mFrequency = 0
    this.mOutput = 0
  }

  restart(): void {
    this.mTimer.restart()
    this.mEnabled = this.mDacOn
  }
}

class LengthCounter {
  private mEnabled = false
  private mCounter = 0
  private readonly mCounterMax: number

  constructor(max: number) {
    this.mCounterMax = max
  }

  counter(): number {
    return this.mCounter
  }

  isEnabled(): boolean {
    return this.mEnabled
  }

  setCounter(value: number): void {
    this.mCounter = value
  }

  setEnable(enabled: boolean): void {
    this.mEnabled = enabled
  }

  clock(channel: Channel): void {
    if (this.mEnabled) {
      if (this.mCounter === 0) {
        channel.disable()
      } else {
        this.mCounter -= 1
      }
    }
  }

  reset(): void {
    this.mEnabled = false
    this.mCounter = 0
  }

  restart(): void {
    if (this.mCounter === 0) {
      this.mCounter = this.mCounterMax
    }
  }
}

class Envelope {
  private mRegister = 0
  private mCounter = 0
  private mPeriod = 0
  private mAmplify = false
  private mVolume = 0

  readRegister(): number {
    return this.mRegister
  }

  writeRegister(channel: Channel, value: number): void {
    this.mRegister = value & 0xff
    channel.setDacEnabled((value & 0xf8) !== 0)
  }

  clock(): void {
    if (this.mPeriod !== 0) {
      this.mCounter += 1
      if (this.mCounter === this.mPeriod) {
        this.mCounter = 0
        if (this.mAmplify) {
          if (this.mVolume < 0xf) {
            this.mVolume += 1
          }
        } else if (this.mVolume > 0x0) {
          this.mVolume -= 1
        }
      }
    }
  }

  reset(): void {
    this.mRegister = 0
    this.mCounter = 0
    this.mPeriod = 0
    this.mAmplify = false
    this.mVolume = 0
  }

  restart(): void {
    this.mCounter = 0
    this.mPeriod = this.mRegister & 0x7
    this.mAmplify = (this.mRegister & 0x8) !== 0
    this.mVolume = this.mRegister >> 4
  }

  volume(): number {
    return this.mVolume
  }
}

class Sweep {
  private mSubtraction = false
  private mTime = 0
  private mShift = 0
  private mCounter = 0
  private mRegister = 0
  private mShadow = 0

  readRegister(): number {
    return this.mRegister
  }

  writeRegister(value: number): void {
    this.mRegister = value & 0x7f
  }

  clock(ch1: PulseChannel): void {
    if (this.mTime !== 0) {
      this.mCounter += 1
      if (this.mCounter >= this.mTime) {
        this.mCounter = 0
        if (this.mShift !== 0) {
          let sweepfreq = this.mShadow >> this.mShift
          if (this.mSubtraction) {
            sweepfreq = this.mShadow - sweepfreq
            if (sweepfreq < 0) {
              return
            }
          } else {
            sweepfreq = this.mShadow + sweepfreq
            if (sweepfreq > MAX_FREQUENCY) {
              ch1.disable()
              return
            }
          }
          ch1.setFrequency(sweepfreq)
          this.mShadow = sweepfreq
        }
      }
    }
  }

  reset(): void {
    this.mSubtraction = false
    this.mTime = 0
    this.mShift = 0
    this.mCounter = 0
    this.mRegister = 0
    this.mShadow = 0
  }

  restart(ch1: PulseChannel): void {
    this.mCounter = 0
    this.mShift = this.mRegister & 0x7
    this.mSubtraction = ((this.mRegister >> 3) & 1) !== 0
    this.mTime = (this.mRegister >> 4) & 0x7
    this.mShadow = ch1.frequency()
  }
}

class NoiseChannel extends Channel {
  private readonly mEnvelope: Envelope
  private mValidScf = true
  private mHalfWidth = false
  private mLfsr = LFSR_INIT

  constructor(envelope: Envelope) {
    super(NOISE_DEFAULT_PERIOD)
    this.mEnvelope = envelope
  }

  setNoise(noisereg: number): void {
    this.mFrequency = noisereg & 0xff

    let drf = this.mFrequency & 0x7
    if (drf === 0) {
      drf = 8
    } else {
      drf *= 16
    }

    this.mHalfWidth = ((this.mFrequency >> 3) & 1) !== 0
    const scf = this.mFrequency >> 4
    this.mValidScf = scf < 0xe
    this.timer().setPeriod(drf << scf)
  }

  clock(): void {
    if (this.mValidScf) {
      this.clockLfsr()
      this.updateOutput()
    }
  }

  override reset(): void {
    super.reset()
    this.mValidScf = true
    this.mHalfWidth = false
    this.mLfsr = LFSR_INIT
    this.timer().setPeriod(NOISE_DEFAULT_PERIOD)
  }

  override restart(): void {
    super.restart()
    this.mLfsr = LFSR_INIT
    this.mOutput = 0
  }

  fastforward(cycles: number): void {
    let clocks = this.timer().fastforward(cycles)
    if (this.mValidScf) {
      while (clocks !== 0) {
        this.clockLfsr()
        clocks -= 1
      }
      this.updateOutput()
    }
  }

  private clockLfsr(): void {
    const result = (this.mLfsr & 0x1) ^ ((this.mLfsr >> 1) & 0x1)
    this.mLfsr >>= 1
    this.mLfsr |= result << 14
    if (this.mHalfWidth) {
      this.mLfsr &= ~0x40
      this.mLfsr |= result << 6
    }
  }

  private updateOutput(): void {
    this.mOutput = -(~this.mLfsr & 1) & this.mEnvelope.volume() & 0xff
  }
}

class PulseChannel extends Channel {
  private readonly mEnvelope: Envelope
  private mDuty = 3
  private mDutyWaveform = dutyWaveform(this.mDuty)
  private mDutyCounter = 0

  constructor(envelope: Envelope) {
    super(PULSE_DEFAULT_PERIOD)
    this.mEnvelope = envelope
  }

  duty(): number {
    return this.mDuty
  }

  setDuty(duty: number): void {
    this.mDuty = duty & 0x3
    this.mDutyWaveform = dutyWaveform(this.mDuty)
  }

  setFrequency(freq: number): void {
    this.mFrequency = freq & 0x7ff
    this.timer().setPeriod((2048 - this.mFrequency) * PULSE_MULTIPLIER)
  }

  clock(): void {
    this.mDutyCounter = (this.mDutyCounter + 1) & 0x7
    this.updateOutput()
  }

  override reset(): void {
    this.timer().setPeriod(PULSE_DEFAULT_PERIOD)
    this.mDutyCounter = 0
    this.setDuty(3)
    super.reset()
  }

  fastforward(cycles: number): void {
    const clocks = this.timer().fastforward(cycles)
    this.mDutyCounter = (this.mDutyCounter + clocks) & 0x7
    this.updateOutput()
  }

  private updateOutput(): void {
    this.mOutput = -((this.mDutyWaveform >> this.mDutyCounter) & 1) & this.mEnvelope.volume() & 0xff
  }
}

class WaveChannel extends Channel {
  private mWaveVolume = 0
  private mVolumeShift = 0
  private mWaveIndex = 0
  private mSampleBuffer = 0
  private readonly mWaveram = new Uint8Array(WAVE_RAMSIZE)

  constructor() {
    super(WAVE_DEFAULT_PERIOD)
  }

  waveram(): Uint8Array {
    return this.mWaveram
  }

  volume(): number {
    return this.mWaveVolume
  }

  setVolume(volume: number): void {
    this.mWaveVolume = volume & 0x3
    switch (this.mWaveVolume) {
      case 0:
        this.mVolumeShift = 4
        break
      case 1:
        this.mVolumeShift = 0
        break
      case 2:
        this.mVolumeShift = 1
        break
      default:
        this.mVolumeShift = 2
        break
    }
    this.updateOutput()
  }

  setFrequency(frequency: number): void {
    this.mFrequency = frequency & 0x7ff
    this.timer().setPeriod((2048 - this.mFrequency) * WAVE_MULTIPLIER)
  }

  clock(): void {
    this.mWaveIndex = (this.mWaveIndex + 1) & 0x1f
    this.updateSampleBuffer()
  }

  override reset(): void {
    this.timer().setPeriod(WAVE_DEFAULT_PERIOD)
    this.mVolumeShift = 0
    this.mWaveVolume = 0
    this.mWaveram.fill(0)
    this.mSampleBuffer = 0
    this.mWaveIndex = 0
    super.reset()
  }

  override restart(): void {
    super.restart()
    this.mWaveIndex = 0
  }

  fastforward(cycles: number): void {
    const clocks = this.timer().fastforward(cycles)
    this.mWaveIndex = (this.mWaveIndex + clocks) & 0x1f
    this.updateSampleBuffer()
  }

  private updateSampleBuffer(): void {
    this.mSampleBuffer = this.mWaveram[this.mWaveIndex >> 1]
    if ((this.mWaveIndex & 1) !== 0) {
      this.mSampleBuffer &= 0xf
    } else {
      this.mSampleBuffer >>= 4
    }
    this.updateOutput()
  }

  private updateOutput(): void {
    this.mOutput = this.mSampleBuffer >> this.mVolumeShift
  }
}

type RunnableChannel = PulseChannel | WaveChannel | NoiseChannel

class Sequencer {
  private readonly mTimer = new Timer(SEQUENCER_DEFAULT_PERIOD)
  private mTriggerIndex = 0

  reset(): void {
    this.mTimer.setPeriod(SEQUENCER_DEFAULT_PERIOD)
    this.mTimer.restart()
    this.mTriggerIndex = 0
  }

  run(hw: Hardware, cycles: number): void {
    if (this.mTimer.run(cycles)) {
      const trigger = TRIGGER_SEQUENCE[this.mTriggerIndex]
      if (trigger.type === TRIGGER_TYPE.lcSweep) {
        hw.clockSweep()
        hw.clockLengthCounters()
      } else if (trigger.type === TRIGGER_TYPE.lc) {
        hw.clockLengthCounters()
      } else {
        hw.clockEnvelopes()
      }
      this.mTimer.setPeriod(trigger.nextPeriod)
      this.mTriggerIndex = trigger.nextIndex
    }
  }

  cyclesToNextTrigger(): number {
    return this.mTimer.counter()
  }
}

class Hardware {
  private readonly mLengthCounters: [LengthCounter, LengthCounter, LengthCounter, LengthCounter]
  private readonly mEnvelopes: [Envelope, Envelope, Envelope]
  private readonly mSweep: Sweep
  private readonly mSequencer: Sequencer
  private readonly mChannels: [PulseChannel, PulseChannel, WaveChannel, NoiseChannel]

  private mMix: ChannelMix
  private mLastOutputs: [number, number, number, number]

  constructor() {
    this.mLengthCounters = [
      new LengthCounter(64),
      new LengthCounter(64),
      new LengthCounter(256),
      new LengthCounter(64),
    ]

    this.mEnvelopes = [new Envelope(), new Envelope(), new Envelope()]
    this.mSweep = new Sweep()
    this.mSequencer = new Sequencer()
    this.mChannels = [
      new PulseChannel(this.mEnvelopes[0]),
      new PulseChannel(this.mEnvelopes[1]),
      new WaveChannel(),
      new NoiseChannel(this.mEnvelopes[2]),
    ]

    this.mMix = [MIX_MODE.mute, MIX_MODE.mute, MIX_MODE.mute, MIX_MODE.mute]
    this.mLastOutputs = [0, 0, 0, 0]
  }

  reset(): void {
    for (const lengthCounter of this.mLengthCounters) {
      lengthCounter.reset()
    }
    for (const envelope of this.mEnvelopes) {
      envelope.reset()
    }

    this.mSweep.reset()
    this.mSequencer.reset()

    this.mChannels[0].reset()
    this.mChannels[1].reset()
    this.mChannels[2].reset()
    this.mChannels[3].reset()

    this.mMix = [MIX_MODE.mute, MIX_MODE.mute, MIX_MODE.mute, MIX_MODE.mute]
    this.mLastOutputs = [0, 0, 0, 0]
  }

  clockEnvelopes(): void {
    for (const envelope of this.mEnvelopes) {
      envelope.clock()
    }
  }

  clockLengthCounters(): void {
    this.mLengthCounters[0].clock(this.mChannels[0])
    this.mLengthCounters[1].clock(this.mChannels[1])
    this.mLengthCounters[2].clock(this.mChannels[2])
    this.mLengthCounters[3].clock(this.mChannels[3])
  }

  clockSweep(): void {
    this.mSweep.clock(this.mChannels[0])
  }

  sweep(): Sweep {
    return this.mSweep
  }

  envelope(channel: 0 | 1 | 3): Envelope {
    if (channel === 3) {
      return this.mEnvelopes[2]
    }
    return this.mEnvelopes[channel]
  }

  lengthCounter(channel: 0 | 1 | 2 | 3): LengthCounter {
    return this.mLengthCounters[channel]
  }

  channel(index: 0 | 1 | 2 | 3): RunnableChannel {
    return this.mChannels[index]
  }

  writeEnvelope(channel: 0 | 1 | 3, value: number): void {
    this.envelope(channel).writeRegister(this.mChannels[channel], value)
  }

  writeFrequencyLsb(channel: 0 | 1 | 2 | 3, lsb: number): void {
    const ch = this.mChannels[channel]
    if (channel === 3) {
      ;(ch as NoiseChannel).setNoise(lsb)
      return
    }

    const nextFrequency = (ch.frequency() & 0xff00) | (lsb & 0xff)
    if (channel === 2) {
      ;(ch as WaveChannel).setFrequency(nextFrequency)
      return
    }
    ;(ch as PulseChannel).setFrequency(nextFrequency)
  }

  writeFrequencyMsb(channel: 0 | 1 | 2 | 3, msb: number): void {
    const ch = this.mChannels[channel]

    if (channel !== 3) {
      const nextFrequency = (ch.frequency() & 0x00ff) | ((msb & 0x7) << 8)
      if (channel === 2) {
        ;(ch as WaveChannel).setFrequency(nextFrequency)
      } else {
        ;(ch as PulseChannel).setFrequency(nextFrequency)
      }
    }

    this.mLengthCounters[channel].setEnable((msb & 0x40) !== 0)

    if ((msb & 0x80) !== 0) {
      ch.restart()
      this.mLengthCounters[channel].restart()

      if (channel !== 2) {
        this.envelope(channel === 3 ? 3 : (channel as 0 | 1)).restart()
      }

      if (channel === 0) {
        this.mSweep.restart(this.mChannels[0])
      }
    }
  }

  setMix(mix: ChannelMix, mixer: Mixer, cycletime: number): void {
    for (let index = 0; index < this.mMix.length; index += 1) {
      const next = mix[index]
      const last = this.mMix[index]
      if (next !== last) {
        const changes = last ^ next

        let dcLeft = 0
        let dcRight = 0

        // Mixing uses digital output deltas; an idle DAC contributes zero here.
        // Adding a 7.5 midpoint produced a startup pop even for Music_Nothing.
        const level = -this.mLastOutputs[index]

        if ((changes & MIX_LEFT) !== 0) {
          dcLeft = mixer.leftVolume() * level
          if (modePansLeft(next)) {
            dcLeft = -dcLeft
          }
        }

        if ((changes & MIX_RIGHT) !== 0) {
          dcRight = mixer.rightVolume() * level
          if (modePansRight(next)) {
            dcRight = -dcRight
          }
        }

        mixer.mixDc(dcLeft, dcRight, cycletime)
      }
    }

    this.mMix = [...mix] as ChannelMix
  }

  mix(): ChannelMix {
    return this.mMix
  }

  lastOutput(channel: number): number {
    return this.mLastOutputs[channel] ?? 0
  }

  run(mixer: Mixer, cycletime: number, cycles: number): void {
    while (cycles !== 0) {
      const toStep = Math.min(cycles, this.mSequencer.cyclesToNextTrigger())
      this.runChannel(0, this.mChannels[0], mixer, cycletime, toStep)
      this.runChannel(1, this.mChannels[1], mixer, cycletime, toStep)
      this.runChannel(2, this.mChannels[2], mixer, cycletime, toStep)
      this.runChannel(3, this.mChannels[3], mixer, cycletime, toStep)
      this.mSequencer.run(this, toStep)

      cycletime += toStep
      cycles -= toStep
    }
  }

  private runChannel(
    index: 0 | 1 | 2 | 3,
    ch: RunnableChannel,
    mixer: Mixer,
    cycletime: number,
    cycles: number,
  ): void {
    const mix = this.preRunChannel(index, ch, mixer, cycletime)
    this.runAndMixChannel(index, ch, mixer, cycletime, cycles, mix)
  }

  private runAndMixChannel(
    index: 0 | 1 | 2 | 3,
    ch: RunnableChannel,
    mixer: Mixer,
    cycletime: number,
    cycles: number,
    mode: MixMode,
  ): void {
    if (mode === MIX_MODE.mute) {
      ch.fastforward(cycles)
      return
    }

    const mixChanges = (): void => {
      const out = ch.output()
      if (out !== this.mLastOutputs[index]) {
        mixer.mixfast(mode, out - this.mLastOutputs[index], cycletime)
        this.mLastOutputs[index] = out
      }
    }

    const timer = ch.timer()

    mixChanges()
    cycletime += timer.counter()

    let clocks = timer.fastforward(cycles)
    const period = timer.period()

    while (clocks !== 0) {
      ch.clock()
      clocks -= 1
      mixChanges()
      cycletime += period
    }
  }

  private preRunChannel(
    index: 0 | 1 | 2 | 3,
    ch: RunnableChannel,
    mixer: Mixer,
    cycletime: number,
  ): MixMode {
    if (ch.isDacOn() && ch.isEnabled()) {
      return this.mMix[index]
    }

    this.silence(index, mixer, cycletime)
    return MIX_MODE.mute
  }

  private silence(channel: 0 | 1 | 2 | 3, mixer: Mixer, cycletime: number): void {
    const output = this.mLastOutputs[channel]
    if (output !== 0) {
      mixer.mix(this.mMix[channel], -output, cycletime)
      this.mLastOutputs[channel] = 0
    }
  }
}

class MixerAccum {
  sum = 0
  highpass = 0

  reset(): void {
    this.sum = 0
    this.highpass = 0
  }

  process(input: number, highPassRate: number): number {
    this.sum += input
    const out = this.sum - this.highpass
    this.highpass = this.sum - out * highPassRate
    return out
  }
}

class Mixer {
  private mVolumeStepLeft = 0
  private mVolumeStepRight = 0

  private mSamplerate = 0
  private mFactor = 0

  private mBuffer: Float32Array = new Float32Array(0)
  private mCapacityFrames = 0
  private readonly mAccumulators: [MixerAccum, MixerAccum] = [new MixerAccum(), new MixerAccum()]
  private mSampleOffset = 0
  private mReadIndex = 0
  private mAvailableFrames = 0
  private mHighpassRate = 0

  constructor() {
    this.setSamplerate(44_100)
  }

  mix(mode: MixMode, delta: number, cycletime: number): void {
    if (mode === MIX_MODE.left || mode === MIX_MODE.right || mode === MIX_MODE.middle) {
      this.mixfast(mode, delta, cycletime)
    }
  }

  mixDc(dcLeft: number, dcRight: number, cycletime: number): void {
    const time = this.sampletime(cycletime)
    const integral = Math.trunc(time)
    let baseFrame = this.mAvailableFrames + integral
    baseFrame = this.ensureWritableBaseFrame(baseFrame)

    const destFrame = this.toPhysicalFrame(baseFrame)
    const destIndex = destFrame * 2
    this.mBuffer[destIndex] += dcLeft
    this.mBuffer[destIndex + 1] += dcRight
  }

  mixfast(mode: MixMode, delta: number, cycletime: number): void {
    if (mode === MIX_MODE.mute) {
      return
    }

    const time = this.sampletime(cycletime)
    const integral = Math.trunc(time)
    const phase = (time - integral) * PHASES
    const phaseIndex = Math.trunc(phase)
    const timeFract = phase - phaseIndex

    const stepset = STEP_TABLE[phaseIndex]
    const nextset = STEP_TABLE[phaseIndex + 1]

    const pansLeft = modePansLeft(mode)
    const pansRight = modePansRight(mode)

    let deltaLeftFirst = 0
    let deltaLeftSecond = 0
    let deltaRightFirst = 0
    let deltaRightSecond = 0

    if (pansLeft) {
      const scaled = delta * this.mVolumeStepLeft
      deltaLeftSecond = scaled * timeFract
      deltaLeftFirst = scaled - deltaLeftSecond
    }

    if (pansRight) {
      const scaled = delta * this.mVolumeStepRight
      deltaRightSecond = scaled * timeFract
      deltaRightFirst = scaled - deltaRightSecond
    }

    let baseFrame = this.mAvailableFrames + integral
    baseFrame = this.ensureWritableBaseFrame(baseFrame)

    for (let index = 0; index < STEP_WIDTH; index += 1) {
      const s0 = stepset[index]
      const s1 = nextset[index]
      const destFrame = this.toPhysicalFrame(baseFrame + index)
      const destIndex = destFrame * 2

      if (pansLeft) {
        this.mBuffer[destIndex] += deltaLeftFirst * s0 + deltaLeftSecond * s1
      }

      if (pansRight) {
        this.mBuffer[destIndex + 1] += deltaRightFirst * s0 + deltaRightSecond * s1
      }
    }
  }

  setVolume(leftVolume: number, rightVolume: number): void {
    this.mVolumeStepLeft = leftVolume
    this.mVolumeStepRight = rightVolume
  }

  leftVolume(): number {
    return this.mVolumeStepLeft
  }

  rightVolume(): number {
    return this.mVolumeStepRight
  }

  setBuffer(samples: number): void {
    const capacityFrames = samples + STEP_WIDTH
    if (capacityFrames !== this.mCapacityFrames) {
      this.mBuffer = new Float32Array(capacityFrames * 2)
      this.mCapacityFrames = capacityFrames
    }
    this.clear()
  }

  setSamplerate(rate: number): void {
    if (this.mSamplerate !== rate) {
      this.mSamplerate = rate
      this.mFactor = this.mSamplerate / CLOCK_SPEED
      this.mHighpassRate = Math.pow(0.999958, 1 / this.mFactor)
    }
  }

  endFrame(cycletime: number): void {
    const time = this.sampletime(cycletime)
    const index = Math.trunc(time)
    this.mSampleOffset = time - index
    this.mAvailableFrames += index

    const maxAvailableFrames = Math.max(0, this.mCapacityFrames - STEP_WIDTH)
    if (this.mAvailableFrames > maxAvailableFrames) {
      this.dropOldestFrames(this.mAvailableFrames - maxAvailableFrames)
    }
  }

  availableSamples(): number {
    return this.mAvailableFrames
  }

  readSamples(buf: AudioBufferTarget, samples: number): number {
    const samplesToRead = Math.min(samples, this.mAvailableFrames)
    if (samplesToRead !== 0) {
      for (let index = 0; index < samplesToRead; index += 1) {
        const frame = this.toPhysicalFrame(index)
        const inIndex = frame * 2
        buf[index * 2] = this.mAccumulators[0].process(this.mBuffer[inIndex], this.mHighpassRate)
        buf[index * 2 + 1] = this.mAccumulators[1].process(
          this.mBuffer[inIndex + 1],
          this.mHighpassRate,
        )
      }
      this.removeSamples(samplesToRead)
    }

    return samplesToRead
  }

  removeSamples(samples: number): void {
    const samplesToRemove = Math.min(samples, this.mAvailableFrames)
    for (let index = 0; index < samplesToRemove; index += 1) {
      const frame = this.toPhysicalFrame(index)
      const offset = frame * 2
      this.mBuffer[offset] = 0
      this.mBuffer[offset + 1] = 0
    }

    if (this.mCapacityFrames > 0) {
      this.mReadIndex = (this.mReadIndex + samplesToRemove) % this.mCapacityFrames
    }
    this.mAvailableFrames -= samplesToRemove
  }

  clear(): void {
    this.mSampleOffset = 0
    this.mReadIndex = 0
    this.mAvailableFrames = 0

    for (const accumulator of this.mAccumulators) {
      accumulator.reset()
    }

    this.mBuffer.fill(0)
  }

  private sampletime(cycletime: number): number {
    return cycletime * this.mFactor + this.mSampleOffset
  }

  private toPhysicalFrame(relativeFrame: number): number {
    if (this.mCapacityFrames === 0) {
      return 0
    }
    return (this.mReadIndex + relativeFrame) % this.mCapacityFrames
  }

  private dropOldestFrames(frames: number): void {
    const toDrop = Math.min(Math.max(0, frames), this.mAvailableFrames)
    if (toDrop === 0) {
      return
    }

    for (let index = 0; index < toDrop; index += 1) {
      const frame = this.toPhysicalFrame(index)
      const offset = frame * 2
      this.mBuffer[offset] = 0
      this.mBuffer[offset + 1] = 0
    }

    if (this.mCapacityFrames > 0) {
      this.mReadIndex = (this.mReadIndex + toDrop) % this.mCapacityFrames
    }
    this.mAvailableFrames -= toDrop
  }

  private ensureWritableBaseFrame(baseFrame: number): number {
    if (this.mCapacityFrames <= STEP_WIDTH) {
      return 0
    }

    const maxBaseFrame = this.mCapacityFrames - STEP_WIDTH
    if (baseFrame <= maxBaseFrame) {
      return baseFrame
    }

    const overflow = baseFrame - maxBaseFrame
    this.dropOldestFrames(overflow)
    const adjusted = baseFrame - overflow
    return adjusted < 0 ? 0 : adjusted
  }
}

export class Apu {
  private readonly mMixer: Mixer

  private mNr51 = 0

  private readonly mHardware: Hardware

  private mCycletime = 0

  private mLeftVolume = 1
  private mRightVolume = 1

  private mEnabled = false

  private mVolumeStep = 0
  private mSamplerate: number
  private mBuffersize: number

  constructor(samplerate: number, buffersizeInSamples: number) {
    this.mMixer = new Mixer()
    this.mHardware = new Hardware()
    this.mSamplerate = samplerate
    this.mBuffersize = buffersizeInSamples

    this.setVolume(1)
    this.mMixer.setBuffer(this.mBuffersize)
    this.mMixer.setSamplerate(samplerate)
  }

  reset(): void {
    this.mCycletime = 0
    this.mMixer.clear()

    this.mHardware.reset()

    this.mLeftVolume = 1
    this.mRightVolume = 1
    this.mEnabled = false

    this.updateVolume()
  }

  step(cycles: number): void {
    this.mHardware.run(this.mMixer, this.mCycletime, cycles)
    this.mCycletime += cycles
  }

  stepTo(time: number): void {
    if (time <= this.mCycletime) {
      return
    }

    this.step(time - this.mCycletime)
  }

  endFrame(): void {
    this.mMixer.endFrame(this.mCycletime)
    this.mCycletime = 0
  }

  readRegister(reg: number, autostep = 12): number {
    this.step(autostep)

    if (!this.mEnabled && reg < APU_REG.REG_NR52) {
      return 0xff
    }

    if (isWaveRamRegister(reg)) {
      const ch = this.mHardware.channel(2) as WaveChannel
      if (!ch.isDacOn()) {
        return ch.waveram()[reg - APU_REG.REG_WAVERAM]
      }
      return 0xff
    }

    switch (reg) {
      case APU_REG.REG_NR10:
        return this.mHardware.sweep().readRegister()
      case APU_REG.REG_NR11:
        return 0x3f | ((this.mHardware.channel(0) as PulseChannel).duty() << 6)
      case APU_REG.REG_NR12:
        return this.mHardware.envelope(0).readRegister()
      case APU_REG.REG_NR13:
        return 0xff
      case APU_REG.REG_NR14:
        return this.mHardware.lengthCounter(0).isEnabled() ? 0xff : 0xbf

      case APU_REG.REG_NR21:
        return 0x3f | ((this.mHardware.channel(1) as PulseChannel).duty() << 6)
      case APU_REG.REG_NR22:
        return this.mHardware.envelope(1).readRegister()
      case APU_REG.REG_NR23:
        return 0xff
      case APU_REG.REG_NR24:
        return this.mHardware.lengthCounter(1).isEnabled() ? 0xff : 0xbf

      case APU_REG.REG_NR30:
        return (this.mHardware.channel(2) as WaveChannel).isDacOn() ? 0xff : 0x7f
      case APU_REG.REG_NR31:
        return 0xff
      case APU_REG.REG_NR32:
        return 0x9f | ((this.mHardware.channel(2) as WaveChannel).volume() << 5)
      case APU_REG.REG_NR33:
        return 0xff
      case APU_REG.REG_NR34:
        return this.mHardware.lengthCounter(2).isEnabled() ? 0xff : 0xbf

      case APU_REG.REG_NR41:
        return 0xff
      case APU_REG.REG_NR42:
        return this.mHardware.envelope(3).readRegister()
      case APU_REG.REG_NR43:
        return this.mHardware.channel(3).frequency() & 0xff
      case APU_REG.REG_NR44:
        return this.mHardware.lengthCounter(3).isEnabled() ? 0xff : 0xbf

      case APU_REG.REG_NR50:
        return ((this.mLeftVolume - 1) << 4) | (this.mRightVolume - 1)
      case APU_REG.REG_NR51:
        return this.mNr51
      case APU_REG.REG_NR52: {
        let nr52 = this.mEnabled ? 0xf0 : 0x70

        if (this.mHardware.channel(0).isDacOn()) {
          nr52 |= 0x1
        }
        if (this.mHardware.channel(1).isDacOn()) {
          nr52 |= 0x2
        }
        if (this.mHardware.channel(2).isDacOn()) {
          nr52 |= 0x4
        }
        if (this.mHardware.channel(3).isDacOn()) {
          nr52 |= 0x8
        }

        return nr52
      }
      default:
        return 0xff
    }
  }

  writeRegister(reg: number, value: number, autostep = 12): void {
    this.step(autostep)

    if (!this.mEnabled && reg < APU_REG.REG_NR52) {
      return
    }

    if (isWaveRamRegister(reg)) {
      const ch = this.mHardware.channel(2) as WaveChannel
      if (!ch.isDacOn()) {
        ch.waveram()[reg - APU_REG.REG_WAVERAM] = value & 0xff
      }
      return
    }

    switch (reg) {
      case APU_REG.REG_NR10:
        this.mHardware.sweep().writeRegister(value)
        break
      case APU_REG.REG_NR11:
        ;(this.mHardware.channel(0) as PulseChannel).setDuty(value >> 6)
        this.mHardware.lengthCounter(0).setCounter(value & 0x3f)
        break
      case APU_REG.REG_NR12:
        this.mHardware.writeEnvelope(0, value)
        break
      case APU_REG.REG_NR13:
        this.mHardware.writeFrequencyLsb(0, value)
        break
      case APU_REG.REG_NR14:
        this.mHardware.writeFrequencyMsb(0, value)
        break
      case APU_REG.REG_NR21:
        ;(this.mHardware.channel(1) as PulseChannel).setDuty(value >> 6)
        this.mHardware.lengthCounter(1).setCounter(value & 0x3f)
        break
      case APU_REG.REG_NR22:
        this.mHardware.writeEnvelope(1, value)
        break
      case APU_REG.REG_NR23:
        this.mHardware.writeFrequencyLsb(1, value)
        break
      case APU_REG.REG_NR24:
        this.mHardware.writeFrequencyMsb(1, value)
        break
      case APU_REG.REG_NR30:
        this.mHardware.channel(2).setDacEnabled((value & 0x80) !== 0)
        break
      case APU_REG.REG_NR31:
        this.mHardware.lengthCounter(2).setCounter(value)
        break
      case APU_REG.REG_NR32:
        ;(this.mHardware.channel(2) as WaveChannel).setVolume((value >> 5) & 0x3)
        break
      case APU_REG.REG_NR33:
        this.mHardware.writeFrequencyLsb(2, value)
        break
      case APU_REG.REG_NR34:
        this.mHardware.writeFrequencyMsb(2, value)
        break
      case APU_REG.REG_NR41:
        this.mHardware.lengthCounter(3).setCounter(value & 0x3f)
        break
      case APU_REG.REG_NR42:
        this.mHardware.writeEnvelope(3, value)
        break
      case APU_REG.REG_NR43:
        this.mHardware.writeFrequencyLsb(3, value)
        break
      case APU_REG.REG_NR44:
        this.mHardware.writeFrequencyMsb(3, value)
        break
      case APU_REG.REG_NR50: {
        this.mLeftVolume = ((value >> 4) & 0x7) + 1
        this.mRightVolume = (value & 0x7) + 1

        const oldVolumeLeft = this.mMixer.leftVolume()
        const oldVolumeRight = this.mMixer.rightVolume()

        this.updateVolume()

        const leftVolDiff = this.mMixer.leftVolume() - oldVolumeLeft
        const rightVolDiff = this.mMixer.rightVolume() - oldVolumeRight

        let dcLeft = 0
        let dcRight = 0

        const mix = this.mHardware.mix()
        for (let index = 0; index < mix.length; index += 1) {
          const mode = mix[index]
          const output = this.mHardware.lastOutput(index)

          if (modePansLeft(mode)) {
            dcLeft += leftVolDiff * output
          }
          if (modePansRight(mode)) {
            dcRight += rightVolDiff * output
          }
        }

        this.mMixer.mixDc(dcLeft, dcRight, this.mCycletime)
        break
      }
      case APU_REG.REG_NR51: {
        this.mNr51 = value & 0xff
        let panning = value & 0xff

        const mix: ChannelMix = [MIX_MODE.mute, MIX_MODE.mute, MIX_MODE.mute, MIX_MODE.mute]

        for (let index = 0; index < mix.length; index += 1) {
          const mode = panning & 0x11
          if (mode === 0x00) {
            mix[index] = MIX_MODE.mute
          } else if (mode === 0x01) {
            mix[index] = MIX_MODE.right
          } else if (mode === 0x10) {
            mix[index] = MIX_MODE.left
          } else {
            mix[index] = MIX_MODE.middle
          }
          panning >>= 1
        }

        this.mHardware.setMix(mix, this.mMixer, this.mCycletime)
        break
      }
      case APU_REG.REG_NR52:
        if (((value & 0x80) !== 0) !== this.mEnabled) {
          if (this.mEnabled) {
            for (
              let index = Number(APU_REG.REG_NR10);
              index !== Number(APU_REG.REG_NR52);
              index += 1
            ) {
              this.writeRegister(index, 0, 0)
            }
            this.mEnabled = false
          } else {
            this.mEnabled = true
          }
        }
        break
      default:
        return
    }
  }

  availableSamples(): number {
    return this.mMixer.availableSamples()
  }

  readSamples(dest: AudioBufferTarget, samples: number): number {
    return this.mMixer.readSamples(dest, samples)
  }

  processSamples(dest: AudioBufferTarget, samples: number): number {
    const written = this.mMixer.readSamples(dest, samples)
    const targetLength = samples * 2
    for (let index = written * 2; index < targetLength; index += 1) {
      dest[index] = 0
    }
    return written
  }

  clearSamples(): void {
    this.mMixer.clear()
  }

  setVolume(gain: number): void {
    this.mVolumeStep = gain / 480
    this.updateVolume()
  }

  setSamplerate(samplerate: number): void {
    if (this.mSamplerate !== samplerate) {
      this.mSamplerate = samplerate
      this.mMixer.setSamplerate(samplerate)
    }
  }

  setBuffersize(samples: number): void {
    if (this.mBuffersize !== samples) {
      this.mBuffersize = samples
      this.mMixer.setBuffer(samples)
    }
  }

  private updateVolume(): void {
    const leftVol = this.mLeftVolume * this.mVolumeStep
    const rightVol = this.mRightVolume * this.mVolumeStep
    this.mMixer.setVolume(leftVol, rightVol)
  }
}
