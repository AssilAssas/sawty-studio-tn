import type { LoudnessPresetId } from '../data/scriptData';

/**
 * Browser-safe WAV parsing, stitching, real PCM loudness mastering (RMS normalization + soft-knee limiter + dead-air trim),
 * waveform peak extraction, and download utilities.
 */

export interface ParsedWav {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  pcmData: Uint8Array;
  durationSec: number;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

/**
 * Parses a RIFF/WAVE buffer cleanly even if non-standard chunks precede "data".
 */
export function parseWavBuffer(bytes: Uint8Array): ParsedWav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const riff =
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46;

  if (!riff) {
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const durationSec = bytes.length / (sampleRate * numChannels * (bitsPerSample / 8));
    return { sampleRate, numChannels, bitsPerSample, pcmData: bytes, durationSec };
  }

  let sampleRate = 24000;
  let numChannels = 1;
  let bitsPerSample = 16;
  let dataOffset = 44;
  let dataSize = Math.max(0, bytes.length - 44);

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkId =
      String.fromCharCode(bytes[offset]) +
      String.fromCharCode(bytes[offset + 1]) +
      String.fromCharCode(bytes[offset + 2]) +
      String.fromCharCode(bytes[offset + 3]);
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === 'fmt ' && offset + 24 <= bytes.length) {
      numChannels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = Math.min(chunkSize, bytes.length - dataOffset);
      break;
    }

    offset += 8 + chunkSize + (chunkSize % 2);
  }

  const pcmData = bytes.subarray(dataOffset, dataOffset + dataSize);
  const bytesPerSecond = sampleRate * numChannels * (bitsPerSample / 8);
  const durationSec = bytesPerSecond > 0 ? pcmData.length / bytesPerSecond : 0;

  return {
    sampleRate,
    numChannels,
    bitsPerSample,
    pcmData,
    durationSec,
  };
}

function encodePcmToWav(
  pcmData: Uint8Array,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number
): Uint8Array {
  const bytesPerSampleFrame = numChannels * (bitsPerSample / 8);
  const wavBytes = new Uint8Array(44 + pcmData.length);
  const view = new DataView(wavBytes.buffer);

  writeAscii(wavBytes, 0, 'RIFF');
  view.setUint32(4, 36 + pcmData.length, true);
  writeAscii(wavBytes, 8, 'WAVE');

  writeAscii(wavBytes, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSampleFrame, true);
  view.setUint16(32, bytesPerSampleFrame, true);
  view.setUint16(34, bitsPerSample, true);

  writeAscii(wavBytes, 36, 'data');
  view.setUint32(40, pcmData.length, true);
  wavBytes.set(pcmData, 44);
  return wavBytes;
}

export interface StitchedBeatMarker {
  beatId: string;
  title: string;
  startSec: number;
  endSec: number;
}

export interface StitchResult {
  wavBytes: Uint8Array;
  blobUrl: string;
  durationSec: number;
  sampleRate: number;
  markers: StitchedBeatMarker[];
}

/**
 * Stitches multiple WAV clips together with natural silence pauses into one seamless RIFF/WAVE file.
 */
export function stitchWavClips(
  clips: Array<{ beatId: string; title: string; wavBytes: Uint8Array; pauseAfterMs: number }>
): StitchResult {
  const parsedClips = clips.map((clip) => ({
    ...clip,
    parsed: parseWavBuffer(clip.wavBytes),
  }));

  const sampleRate = parsedClips[0]?.parsed.sampleRate || 24000;
  const numChannels = parsedClips[0]?.parsed.numChannels || 1;
  const bitsPerSample = parsedClips[0]?.parsed.bitsPerSample || 16;
  const bytesPerSampleFrame = numChannels * (bitsPerSample / 8);

  const segments: Uint8Array[] = [];
  const markers: StitchedBeatMarker[] = [];
  let cursorSec = 0;

  parsedClips.forEach((item, idx) => {
    const startSec = cursorSec;
    segments.push(item.parsed.pcmData);
    cursorSec += item.parsed.durationSec;
    const endSec = cursorSec;

    markers.push({
      beatId: item.beatId,
      title: item.title,
      startSec,
      endSec,
    });

    const isLast = idx === parsedClips.length - 1;
    if (!isLast && item.pauseAfterMs > 0) {
      const pauseFrames = Math.round((sampleRate * item.pauseAfterMs) / 1000);
      const silence = new Uint8Array(pauseFrames * bytesPerSampleFrame);
      segments.push(silence);
      cursorSec += pauseFrames / sampleRate;
    }
  });

  const totalPcmBytes = segments.reduce((sum, seg) => sum + seg.length, 0);
  const combinedPcm = new Uint8Array(totalPcmBytes);
  let writeOffset = 0;
  for (const seg of segments) {
    combinedPcm.set(seg, writeOffset);
    writeOffset += seg.length;
  }

  const wavBytes = encodePcmToWav(combinedPcm, sampleRate, numChannels, bitsPerSample);
  const blob = wavBytesToBlob(wavBytes);
  const blobUrl = URL.createObjectURL(blob);

  return {
    wavBytes,
    blobUrl,
    durationSec: cursorSec,
    sampleRate,
    markers,
  };
}

export interface MasteringOptions {
  preset: LoudnessPresetId;
  gainDb: number;
  trimSilence: boolean;
}

export interface MasteredWavResult {
  wavBytes: Uint8Array;
  blobUrl: string;
  durationSec: number;
  sampleRate: number;
  peakDbfs: number;
  rmsDbfs: number;
  trimmedStartSec: number;
}

/**
 * Applies real-time broadcast mastering DSP directly to 16-bit PCM WAV bytes:
 * 1. Optional leading/trailing dead-air trimming (0.0s thumbstop hook) with smooth 25ms fade cushion.
 * 2. Active-speech RMS loudness normalization (Social Loud / Broadcast / Raw) + manual dB gain.
 * 3. Analog-style soft-knee peak limiter capped at -1.0 dBFS to prevent mobile speaker clipping.
 */
export function applyAudioMastering(
  rawWavBytes: Uint8Array,
  options: MasteringOptions
): MasteredWavResult {
  const parsed = parseWavBuffer(rawWavBytes);
  const { sampleRate, numChannels, bitsPerSample, pcmData } = parsed;

  if (bitsPerSample !== 16 || pcmData.length < 4) {
    const blobUrl = URL.createObjectURL(wavBytesToBlob(rawWavBytes));
    return {
      wavBytes: rawWavBytes,
      blobUrl,
      durationSec: parsed.durationSec,
      sampleRate,
      peakDbfs: -1.0,
      rmsDbfs: -16.0,
      trimmedStartSec: 0,
    };
  }

  const inView = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength);
  const totalSamples = Math.floor(pcmData.length / 2);

  // Convert to Float32 [-1, 1]
  const samples = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    samples[i] = inView.getInt16(i * 2, true) / 32768;
  }

  // Optional dead-air trim at start/end
  let startIdx = 0;
  let endIdx = totalSamples;
  if (options.trimSilence && totalSamples > sampleRate * 0.25) {
    const threshold = 0.01; // ~ -40 dBFS
    const padSamples = Math.floor(sampleRate * 0.03) * numChannels;
    let firstActive = 0;
    while (firstActive < totalSamples && Math.abs(samples[firstActive]) < threshold) {
      firstActive++;
    }
    let lastActive = totalSamples - 1;
    while (lastActive > firstActive && Math.abs(samples[lastActive]) < threshold) {
      lastActive--;
    }
    if (lastActive > firstActive) {
      startIdx = Math.max(0, firstActive - padSamples);
      endIdx = Math.min(totalSamples, lastActive + padSamples);
    }
  }

  const trimmedLength = Math.max(1, endIdx - startIdx);
  const trimmedStartSec = startIdx / (sampleRate * numChannels);

  // Compute active speech RMS (ignoring quiet breath pauses < 0.015)
  let activeSumSq = 0;
  let activeCount = 0;
  for (let i = startIdx; i < endIdx; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > 0.015) {
      activeSumSq += samples[i] * samples[i];
      activeCount++;
    }
  }
  const activeRms = activeCount > 0 ? Math.sqrt(activeSumSq / activeCount) : 0.1;

  // Determine target linear gain from preset + custom gain dB
  let presetMultiplier = 1.0;
  if (options.preset === 'social-loud') {
    presetMultiplier = Math.min(5.0, Math.max(0.4, 0.24 / Math.max(0.02, activeRms)));
  } else if (options.preset === 'broadcast') {
    presetMultiplier = Math.min(4.0, Math.max(0.4, 0.17 / Math.max(0.02, activeRms)));
  }
  const manualMultiplier = Math.pow(10, options.gainDb / 20);
  const totalGain = Math.min(8.0, presetMultiplier * manualMultiplier);

  // Apply gain + soft-knee limiter (-1.0 dBFS ceiling = 0.891) + micro fade-in/out
  const knee = 0.76;
  const headroom = 0.891 - knee; // 0.131
  const fadeSamples = Math.min(Math.floor(sampleRate * 0.015), Math.floor(trimmedLength / 4));

  const outPcm = new Uint8Array(trimmedLength * 2);
  const outView = new DataView(outPcm.buffer);

  let outPeak = 0.0001;
  let outActiveSumSq = 0;
  let outActiveCount = 0;

  for (let i = 0; i < trimmedLength; i++) {
    let x = samples[startIdx + i] * totalGain;

    // Soft-knee saturation above knee to prevent digital clipping
    const absX = Math.abs(x);
    if (absX > knee) {
      x = Math.sign(x) * (knee + headroom * Math.tanh((absX - knee) / headroom));
    }

    // Smooth micro fade on trimmed boundaries
    if (fadeSamples > 0) {
      if (i < fadeSamples) {
        x *= i / fadeSamples;
      } else if (i >= trimmedLength - fadeSamples) {
        x *= (trimmedLength - 1 - i) / fadeSamples;
      }
    }

    const clamped = Math.max(-0.999, Math.min(0.999, x));
    const absOut = Math.abs(clamped);
    if (absOut > outPeak) outPeak = absOut;
    if (absOut > 0.015) {
      outActiveSumSq += clamped * clamped;
      outActiveCount++;
    }

    outView.setInt16(i * 2, Math.round(clamped * 32767), true);
  }

  const outActiveRms =
    outActiveCount > 0 ? Math.sqrt(outActiveSumSq / outActiveCount) : 0.0001;

  const peakDbfs = 20 * Math.log10(Math.max(0.0001, outPeak));
  const rmsDbfs = 20 * Math.log10(Math.max(0.0001, outActiveRms));

  const wavBytes = encodePcmToWav(outPcm, sampleRate, numChannels, bitsPerSample);
  const blobUrl = URL.createObjectURL(wavBytesToBlob(wavBytes));
  const durationSec = trimmedLength / (sampleRate * numChannels);

  return {
    wavBytes,
    blobUrl,
    durationSec,
    sampleRate,
    peakDbfs,
    rmsDbfs,
    trimmedStartSec,
  };
}

function writeAscii(target: Uint8Array, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) {
    target[offset + i] = text.charCodeAt(i);
  }
}

/**
 * Extracts normalized waveform amplitude peaks directly from 16-bit PCM WAV data.
 */
export function extractWaveformPeaks(wavBytes: Uint8Array, barCount = 140): number[] {
  const { pcmData, bitsPerSample } = parseWavBuffer(wavBytes);
  if (pcmData.length < 4 || bitsPerSample !== 16) {
    return Array.from({ length: barCount }, () => 0.12);
  }

  const view = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength);
  const totalSamples = Math.floor(pcmData.length / 2);
  const samplesPerBar = Math.max(1, Math.floor(totalSamples / barCount));
  const peaks: number[] = [];
  let globalMax = 0.001;

  for (let i = 0; i < barCount; i++) {
    const start = i * samplesPerBar;
    const end = Math.min(totalSamples, start + samplesPerBar);
    let sumSq = 0;
    let count = 0;
    const stride = Math.max(1, Math.floor((end - start) / 120));
    for (let s = start; s < end; s += stride) {
      const sample = view.getInt16(s * 2, true) / 32768;
      sumSq += sample * sample;
      count++;
    }
    const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
    if (rms > globalMax) globalMax = rms;
    peaks.push(rms);
  }

  return peaks.map((val) => Math.max(0.05, Math.min(1, val / globalMax)));
}

export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.0';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export function formatShortDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const rounded = Math.round(seconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function wavBytesToBlob(wavBytes: Uint8Array): Blob {
  const copy = new Uint8Array(wavBytes.byteLength);
  copy.set(wavBytes);
  return new Blob([copy], { type: 'audio/wav' });
}

export function triggerWavDownload(wavBytes: Uint8Array, filename: string): void {
  const blob = wavBytesToBlob(wavBytes);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
