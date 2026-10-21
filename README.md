# gbapu

A Game Boy APU (DMG sound) emulator and audio compiler in TypeScript. The emulation is a port of
[stoneface's gbapu](https://github.com/stoneface86/gbapu) (C++); see [Credits](#credits).

Describe a sound as a stream of Game Boy sound register writes and waits, and gbapu compiles it
into a timeline, runs it through an emulation of the four DMG sound channels (two pulse channels,
the wave channel and the noise channel) and renders stereo PCM offline, ready to play with the Web
Audio API or to save as a WAV file.

- No dependencies. ESM with TypeScript declarations.
- Runs in browsers, Web Workers and Node: it uses typed arrays and `Blob`, no Node APIs.
- Deterministic: the same input renders the same samples, bit for bit.

## Install

```sh
npm install gbapu
```

## Usage

Half a second of A4 on pulse channel 1, saved as a WAV file in Node:

```ts
import { writeFileSync } from 'node:fs'
import {
  encodeInterleavedStereoPcm16Wav,
  renderEngineAudioToPcm,
  type EngineAudioData,
} from 'gbapu'

// Half a second of A4 (440 Hz) on pulse channel 1.
const beep: EngineAudioData = {
  id: 'example:beep',
  name: 'Beep',
  category: 'sfx',
  sourceLabel: 'Example',
  channels: [
    {
      id: 1,
      commands: [
        ['n11', 0x80], // NR11: 50% duty
        ['n12', 0xf0], // NR12: full volume, no envelope
        ['n13', 0xd6], // NR13: low 8 bits of the frequency value 1750 (0x6d6)
        ['n14', 0x86], // NR14: trigger, high 3 bits of the frequency value
        ['wait', 2_097_152], // half a second, in CPU cycles (4,194,304 per second)
        ['end'],
      ],
    },
  ],
}

const { sampleRate, interleavedStereo } = renderEngineAudioToPcm(beep, { sampleRate: 48_000 })
const wav = encodeInterleavedStereoPcm16Wav(interleavedStereo, sampleRate)
writeFileSync('beep.wav', new Uint8Array(wav))
```

A pulse channel plays `131072 / (2048 - x)` Hz, `x` being the 11-bit frequency value split
between NR13 and NR14: 1750 gives 439.8 Hz.

In a browser, `renderEngineAudioToWavBlob(beep)` returns an `audio/wav` `Blob` to play or download,
and `interleavedStereo` (left and right samples alternating, from -1 to 1) splits into the two
channels of an `AudioBuffer`. Rendering a long song takes a moment, so a Web Worker keeps the page
responsive.

## Sound data

An `EngineAudioData` value holds metadata (`id`, `name`, `category`, `sourceLabel`) and a list of
channels. Each channel has an `id` (1 and 2 pulse, 3 wave, 4 noise), a list of `commands` and,
optionally, a `loopStartCommandIndex` where its loop starts.

| Command                                                      | Effect                                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `[register, value]`                                          | Writes a byte to a sound register.                                                                            |
| `['wait', cycles]`                                           | Advances time by CPU cycles (4,194,304 per second).                                                           |
| `['end']`                                                    | Ends the channel; later commands are ignored.                                                                 |
| `['stereo_panning', bits]`, `['force_stereo_panning', bits]` | Writes NR51 (left and right output).                                                                          |
| `['tempo', value]`, `['sfx_priority', 0 \| 1]`               | Recorded in the compiled timeline's `controls` for players that need them. The offline renderer ignores them. |

Register tokens are `n` or `w` plus the low byte of the register's `$FFxx` address in hex:
`n10`..`n14` are NR10..NR14 (pulse 1), `n16`..`n19` NR21..NR24 (pulse 2), `n1a`..`n1e`
NR30..NR34 (wave), `n20`..`n23` NR41..NR44 (noise), `n24`..`n26` NR50..NR52 (volume, panning,
power) and `w30`..`w3f` the 16 bytes of wave RAM.

Values are bytes. Writes to `n21` (NR42) and `n22` (NR43) also accept drum tokens such as `'sn01'`
or `'hh01'`: named noise settings listed in `AUDIO_DRUM_TOKEN_TO_VALUES`.

The renderer powers the APU on with both outputs at full volume and every channel on both sides
(NR52 `0x80`, NR50 `0x77`, NR51 `0xff`). An NR51 write, from `n25` or a panning command, changes
only the bits of the channel that makes it. Each channel is muted when its commands end.

[Pan Docs](https://gbdev.io/pandocs/Audio.html) describes what each register does.

## API

### Rendering

- `renderEngineAudioToPcm(data, options?)` returns `{ sampleRate, interleavedStereo }`, a
  `Float32Array` of stereo frames. Options:
  - `sampleRate`: default 48,000, minimum 8,000.
  - `loopCount`: extra passes through each channel's loop, 0 to 16. Default 0.
  - `tailMs`: release rendered after the last command, up to 5,000. Default 120.
  - `durationCycles`: an exact length in CPU cycles instead; looping channels repeat until it ends.
- `renderEngineAudioToWavBlob(data, options?)` renders to an `audio/wav` `Blob`.
- `encodeInterleavedStereoPcm16Wav(interleavedStereo, sampleRate, loop?)` encodes 16-bit stereo
  WAV as an `ArrayBuffer`. With `loop` (`{ start_frame, end_frame }`) it adds a `smpl` chunk
  marking the loop.

Renders are limited to 15 minutes of music and 10 minutes of other categories, and throw beyond
that.

### Compiling

- `compileEngineAudio(data)` returns a `CompiledEngineAudioTimeline`: per channel, the register
  writes with their cycle (`events`), the driver `controls`, `totalCycles` and `loopStartCycle`.
  Use it to drive the `Apu` yourself, for example in an `AudioWorklet`.

### The APU

- `new Apu(sampleRate, bufferSizeInSamples)` emulates the sound hardware.
  - `writeRegister(register, value, autostep?)`, `readRegister(register, autostep?)`: register
    addresses are `APU_REG` values (the low byte of `$FFxx`).
  - `step(cycles)`, `stepTo(time)` advance emulated time. `endFrame()` makes the samples rendered
    so far available.
  - `availableSamples()`, `readSamples(dest, samples)` read interleaved stereo samples.
    `processSamples(dest, samples)` does the same and fills the rest of `dest` with silence.
  - `reset()`, `clearSamples()`, `setVolume(gain)`, `setSamplerate(rate)`,
    `setBuffersize(samples)`.
- `APU_REG`: the register addresses, `REG_NR10` to `REG_NR52` and `REG_WAVERAM`.
- `MIX_MODE`: `mute`, `left`, `right` and `middle`.

### Tokens

- `AUDIO_REGISTER_TOKEN_TO_VALUE`, `resolveAudioRegister(token)`,
  `audioRegisterTokenFromValue(register)`: register tokens and addresses.
- `AUDIO_DRUM_TOKEN_TO_VALUES`, `resolveAudioValue(token, value)`,
  `audioValueTokenFromRegisterValue(register, value)`: drum tokens and their NR42/NR43 values.

### Types

`EngineAudioData`, `EngineAudioChannelData`, `EngineAudioCommand` (and one type per command),
`EngineAudioMetadata`, `EngineAudioCatalogEntry`, `AudioCategory`, `EngineAudioChannelId`,
`EngineAudioRegisterToken`, `EngineAudioValueToken`, `EngineAudioExportOptions`,
`EngineAudioRenderResult`, the `CompiledEngineAudio*` timeline types, and the optional driver
program types a channel can carry (`PulseDriverProgram`, `EffectDriverProgram`,
`NoiseDriverProgram`, `WaveDriverProgram`, `MusicPulseDriverProgram`, `NoiseSampleBank`,
`WaveSampleBank`), which the renderer does not use.

## Contributing

Development and releases are described in [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits

The APU emulation is a TypeScript port of [gbapu](https://github.com/stoneface86/gbapu) by
stoneface, a Game Boy APU emulator in C++, used under the MIT License (see [LICENSE](LICENSE)).
The audio compiler, the command tokens and the WAV export are by Javi Aguilar.

The package contains no ROM, songs or sound effects. The drum tokens are noise channel register
settings (two bytes each) and carry no audio data.

## License

[MIT](LICENSE) © 2026 Javi Aguilar. The port of stoneface's gbapu keeps its MIT notice, included
in the same file.
