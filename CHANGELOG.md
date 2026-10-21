# Changelog

## 1.0.1 (2026-10-21)

No user-facing changes.

## 1.0.0

First release.

- `Apu`: the Game Boy APU emulation, with `APU_REG` and `MIX_MODE`.
- `compileEngineAudio`: compiles command streams of register writes, waits and driver controls
  into cycle-timed register writes per channel.
- `renderEngineAudioToPcm` and `renderEngineAudioToWavBlob`: deterministic offline rendering to
  stereo PCM or a WAV `Blob`, with loops, an exact render length and a release tail.
- `encodeInterleavedStereoPcm16Wav`: 16-bit stereo WAV encoding, with an optional `smpl` loop.
- Register and drum tokens with their lookups, and the sound data types.
