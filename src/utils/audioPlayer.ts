import { parseWavBuffer } from './wavUtils';

/**
 * Reliable Web Audio API PCM player that decodes 16-bit PCM WAV bytes directly into an AudioBuffer.
 * Eliminates blob: URL revocation errors, 24kHz mono <audio> codec quirks, and silent iframe playback failures.
 */

let sharedAudioContext: AudioContext | null = null;

function getAudioContextClass(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  );
}

export function getSharedAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    const Ctor = getAudioContextClass();
    if (!Ctor) {
      throw new Error('Web Audio API is not supported in this browser.');
    }
    sharedAudioContext = new Ctor();
  }
  return sharedAudioContext;
}

function resumeWithTimeout(ctx: AudioContext, timeoutMs = 450): Promise<boolean> {
  if (ctx.state === 'running') return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(ctx.state === 'running'), timeoutMs);
    ctx
      .resume()
      .then(() => {
        window.clearTimeout(timer);
        finish(ctx.state === 'running');
      })
      .catch(() => {
        window.clearTimeout(timer);
        finish(false);
      });
  });
}

/**
 * Call synchronously inside user click handlers (e.g. Generate / Play) to unlock browser audio playback.
 */
export async function unlockAudioContext(): Promise<boolean> {
  try {
    const ctx = getSharedAudioContext();
    return await resumeWithTimeout(ctx, 450);
  } catch {
    return false;
  }
}

/**
 * Generates a short, gentle 44.1 kHz 16-bit PCM WAV two-note chime for speaker/tab verification.
 */
export function generateTestChimeWavBytes(): Uint8Array {
  const sampleRate = 44100;
  const durationSec = 0.36;
  const frameCount = Math.floor(sampleRate * durationSec);
  const dataBytes = frameCount * 2;
  const wav = new Uint8Array(44 + dataBytes);
  const view = new DataView(wav.buffer);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) wav[off + i] = s.charCodeAt(i);
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < frameCount; i++) {
    const t = i / sampleRate;
    const freq = t < 0.16 ? 523.25 : 659.25; // C5 -> E5 gentle studio chime
    const localT = t < 0.16 ? t : t - 0.16;
    const env = Math.min(1, localT / 0.012) * Math.exp(-localT * 10);
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.35 * env;
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }

  return wav;
}

/**
 * Converts RIFF/WAVE 16-bit PCM bytes directly into a Web Audio AudioBuffer (no async codec decode latency).
 */
export function wavBytesToAudioBuffer(wavBytes: Uint8Array): AudioBuffer {
  const ctx = getSharedAudioContext();
  const parsed = parseWavBuffer(wavBytes);
  const { sampleRate, numChannels, bitsPerSample, pcmData } = parsed;

  if (bitsPerSample !== 16 || pcmData.length < 2) {
    throw new Error('Unsupported WAV format (expected 16-bit PCM).');
  }

  const bytesPerSample = 2;
  const frameCount = Math.floor(pcmData.length / (bytesPerSample * numChannels));
  const buffer = ctx.createBuffer(numChannels, Math.max(1, frameCount), sampleRate);
  const view = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength);

  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < frameCount; i++) {
      const sampleOffset = (i * numChannels + ch) * 2;
      channelData[i] = view.getInt16(sampleOffset, true) / 32768;
    }
  }

  return buffer;
}

export class WebAudioPcmPlayer {
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private isPlayingState = false;
  private startContextTime = 0;
  private offsetSec = 0;
  private playbackRate = 1.0;
  private volume = 1.0;
  private muted = false;
  private rafId: number | null = null;
  private onTimeUpdate?: (timeSec: number) => void;
  private onStateChange?: (playing: boolean) => void;
  private onEnded?: () => void;

  constructor(callbacks?: {
    onTimeUpdate?: (timeSec: number) => void;
    onStateChange?: (playing: boolean) => void;
    onEnded?: () => void;
  }) {
    this.onTimeUpdate = callbacks?.onTimeUpdate;
    this.onStateChange = callbacks?.onStateChange;
    this.onEnded = callbacks?.onEnded;
  }

  loadWavBytes(wavBytes: Uint8Array, preservePosition = false): number {
    const wasPlaying = this.isPlayingState;
    const prevTime = preservePosition ? this.getCurrentTime() : 0;

    this.stopSourceOnly();
    this.buffer = wavBytesToAudioBuffer(wavBytes);
    this.offsetSec = preservePosition
      ? Math.max(0, Math.min(prevTime, Math.max(0, this.buffer.duration - 0.05)))
      : 0;

    this.onTimeUpdate?.(this.offsetSec);

    if (preservePosition && wasPlaying) {
      void this.play(this.offsetSec);
    } else {
      this.isPlayingState = false;
      this.onStateChange?.(false);
    }

    return this.buffer.duration;
  }

  getDuration(): number {
    return this.buffer?.duration ?? 0;
  }

  getCurrentTime(): number {
    if (!this.buffer) return 0;
    if (!this.isPlayingState) return this.offsetSec;
    const ctx = getSharedAudioContext();
    const elapsed = (ctx.currentTime - this.startContextTime) * this.playbackRate;
    return Math.max(0, Math.min(this.buffer.duration, this.offsetSec + elapsed));
  }

  isPlaying(): boolean {
    return this.isPlayingState;
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode) {
      this.gainNode.gain.value = this.muted ? 0 : this.volume;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.gainNode) {
      this.gainNode.gain.value = this.muted ? 0 : this.volume;
    }
  }

  setPlaybackRate(rate: number): void {
    const clamped = Math.max(0.5, Math.min(2.0, rate));
    if (this.isPlayingState) {
      const current = this.getCurrentTime();
      this.playbackRate = clamped;
      void this.play(current);
    } else {
      this.playbackRate = clamped;
    }
  }

  async play(fromSec?: number): Promise<void> {
    if (!this.buffer) {
      throw new Error('No audio loaded.');
    }

    const ctx = getSharedAudioContext();
    const running = await resumeWithTimeout(ctx, 450);
    if (!running) {
      throw new Error('Browser paused autoplay. Click Play Master to start listening.');
    }

    this.stopSourceOnly();

    const targetStart =
      typeof fromSec === 'number'
        ? Math.max(0, Math.min(fromSec, this.buffer.duration))
        : this.offsetSec >= this.buffer.duration - 0.05
          ? 0
          : this.offsetSec;

    const gain = ctx.createGain();
    gain.gain.value = this.muted ? 0 : this.volume;
    gain.connect(ctx.destination);

    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = this.playbackRate;
    source.connect(gain);

    this.gainNode = gain;
    this.source = source;
    this.offsetSec = targetStart;
    this.startContextTime = ctx.currentTime;
    this.isPlayingState = true;
    this.onStateChange?.(true);

    source.onended = () => {
      // Only treat as natural end if this is still the active source
      if (this.source !== source) return;
      this.stopRaf();
      this.source = null;
      this.gainNode = null;
      this.isPlayingState = false;
      this.offsetSec = this.buffer?.duration ?? 0;
      this.onTimeUpdate?.(this.offsetSec);
      this.onStateChange?.(false);
      this.onEnded?.();
    };

    source.start(0, targetStart);
    this.startRaf();
  }

  pause(): void {
    if (!this.isPlayingState) return;
    this.offsetSec = this.getCurrentTime();
    this.stopSourceOnly();
    this.isPlayingState = false;
    this.onTimeUpdate?.(this.offsetSec);
    this.onStateChange?.(false);
  }

  stop(): void {
    this.stopSourceOnly();
    this.offsetSec = 0;
    this.isPlayingState = false;
    this.onTimeUpdate?.(0);
    this.onStateChange?.(false);
  }

  seek(timeSec: number): void {
    if (!this.buffer) return;
    const clamped = Math.max(0, Math.min(timeSec, this.buffer.duration));
    if (this.isPlayingState) {
      void this.play(clamped);
    } else {
      this.offsetSec = clamped;
      this.onTimeUpdate?.(clamped);
    }
  }

  dispose(): void {
    this.stopSourceOnly();
    this.buffer = null;
  }

  private stopSourceOnly(): void {
    this.stopRaf();
    if (this.source) {
      const oldSource = this.source;
      this.source = null;
      oldSource.onended = null;
      try {
        oldSource.stop();
      } catch {
        // Ignore if already stopped
      }
      try {
        oldSource.disconnect();
      } catch {
        // Ignore
      }
    }
    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {
        // Ignore
      }
      this.gainNode = null;
    }
  }

  private startRaf(): void {
    this.stopRaf();
    const tick = () => {
      if (!this.isPlayingState) return;
      this.onTimeUpdate?.(this.getCurrentTime());
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
