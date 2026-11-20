import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  ExternalLink,
  HelpCircle,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Wand2,
} from 'lucide-react';
import type { StitchedBeatMarker } from '../utils/wavUtils';
import { formatTimecode, wavBytesToBlob } from '../utils/wavUtils';
import {
  WebAudioPcmPlayer,
  generateTestChimeWavBytes,
  unlockAudioContext,
} from '../utils/audioPlayer';

type PlaybackEngine = 'native' | 'webaudio';

interface WaveformPlayerProps {
  projectTitle: string;
  dialectLabel: string;
  paceLabel: string;
  loudnessLabel: string;
  peakDbfs: number | null;
  rmsDbfs: number | null;
  wavBytes: Uint8Array | null;
  generationNonce: number;
  peaks: number[];
  durationSec: number;
  sampleRate: number;
  markers: StitchedBeatMarker[];
  isGenerating: boolean;
  generationProgress: {
    current: number;
    total: number;
    label: string;
  } | null;
  activeBeatId: string | null;
  onActiveBeatChange: (beatId: string | null) => void;
  onGenerateMaster: () => void;
  onDownloadMaster: () => void;
  onWillStartMasterPlay?: () => void;
  stopMasterSignal: number;
  seekRequest: { timeSec: number; nonce: number } | null;
  totalWordCount: number;
  beatCount: number;
  voiceName: string;
  voiceGender: string;
  modelLabel: string;
}

const SPEED_OPTIONS = [0.9, 1.0, 1.1, 1.2] as const;

export const WaveformPlayer: React.FC<WaveformPlayerProps> = ({
  projectTitle,
  dialectLabel,
  paceLabel,
  loudnessLabel,
  peakDbfs,
  rmsDbfs,
  wavBytes,
  generationNonce,
  peaks,
  durationSec,
  sampleRate,
  markers,
  isGenerating,
  generationProgress,
  activeBeatId,
  onActiveBeatChange,
  onGenerateMaster,
  onDownloadMaster,
  onWillStartMasterPlay,
  stopMasterSignal,
  seekRequest,
  totalWordCount,
  beatCount,
  voiceName,
  voiceGender,
  modelLabel,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const webAudioRef = useRef<WebAudioPcmPlayer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastGenNonceRef = useRef<number>(generationNonce);
  const autoPlayReadyRef = useRef<boolean>(true);
  const triedHttpFallbackRef = useRef<boolean>(false);

  const [engine, setEngine] = useState<PlaybackEngine>('native');
  const [nativeAudioUrl, setNativeAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [actualDuration, setActualDuration] = useState(durationSec);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(1.0);
  const [muted, setMuted] = useState<boolean>(false);
  const [autoPlayReady, setAutoPlayReady] = useState<boolean>(true);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [playbackNotice, setPlaybackNotice] = useState<string | null>(null);
  const [showAudioHelp, setShowAudioHelp] = useState<boolean>(false);
  const [chimeStatus, setChimeStatus] = useState<string | null>(null);

  const hasAudio = Boolean(wavBytes && wavBytes.length > 44);
  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  useEffect(() => {
    autoPlayReadyRef.current = autoPlayReady;
  }, [autoPlayReady]);

  // Initialize fallback Web Audio PCM player
  useEffect(() => {
    const player = new WebAudioPcmPlayer({
      onTimeUpdate: (t) => setCurrentTime(t),
      onStateChange: (playing) => setIsPlaying(playing),
      onEnded: () => setIsPlaying(false),
    });
    webAudioRef.current = player;
    return () => {
      player.dispose();
      webAudioRef.current = null;
    };
  }, []);

  // Safely manage native <audio> blob URL lifecycle & Web Audio buffer whenever wavBytes changes
  useEffect(() => {
    if (!wavBytes || wavBytes.length <= 44) {
      webAudioRef.current?.stop();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }
      setNativeAudioUrl(null);
      setIsPlaying(false);
      setActualDuration(0);
      setCurrentTime(0);
      setPlaybackNotice(null);
      return;
    }

    const isFreshGeneration = generationNonce !== lastGenNonceRef.current;
    lastGenNonceRef.current = generationNonce;
    triedHttpFallbackRef.current = false;

    const blob = wavBytesToBlob(wavBytes);
    const nextBlobUrl = URL.createObjectURL(blob);
    setNativeAudioUrl(nextBlobUrl);
    setPlaybackNotice(null);
    setActualDuration(durationSec);

    // Keep Web Audio buffer synchronized as an instant fallback
    try {
      const dur = webAudioRef.current?.loadWavBytes(wavBytes, !isFreshGeneration);
      if (dur) setActualDuration(dur);
    } catch {
      // Ignore Web Audio decode error if native audio handles playback
    }

    if (engine === 'native') {
      const audio = audioRef.current;
      if (audio) {
        const prevTime = isFreshGeneration ? 0 : audio.currentTime || 0;
        const wasPlaying = !isFreshGeneration && !audio.paused;

        audio.src = nextBlobUrl;
        audio.volume = muted ? 0 : volume;
        audio.muted = muted;
        audio.playbackRate = playbackRate;
        audio.load();

        const seekAndMaybePlay = () => {
          if (prevTime > 0 && Number.isFinite(audio.duration)) {
            audio.currentTime = Math.min(prevTime, Math.max(0, audio.duration - 0.05));
          } else {
            audio.currentTime = 0;
          }
          setCurrentTime(audio.currentTime);
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            setActualDuration(audio.duration);
          }

          if ((isFreshGeneration && autoPlayReadyRef.current) || wasPlaying) {
            onWillStartMasterPlay?.();
            audio.play().catch(() => {
              setIsPlaying(false);
              setPlaybackNotice(
                'Audio is ready — click Play Master or the native play button below to listen.'
              );
            });
          }
        };

        if (audio.readyState >= 1) {
          seekAndMaybePlay();
        } else {
          audio.addEventListener('loadedmetadata', seekAndMaybePlay, { once: true });
        }
      }
    } else if (isFreshGeneration && autoPlayReadyRef.current) {
      onWillStartMasterPlay?.();
      webAudioRef.current?.play(0).catch(() => {
        setPlaybackNotice('Audio is ready — click Play Master below to start listening.');
      });
    }

    return () => {
      // Only revoke after the previous effect is torn down (never mid-render!)
      URL.revokeObjectURL(nextBlobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wavBytes, generationNonce]);

  // Keep native <audio> in sync with volume, mute, and playback rate
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = muted ? 0 : volume;
      audio.muted = muted;
    }
    webAudioRef.current?.setVolume(volume);
    webAudioRef.current?.setMuted(muted);
  }, [volume, muted]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
    webAudioRef.current?.setPlaybackRate(playbackRate);
  }, [playbackRate]);

  // Smooth RAF playhead sync while native <audio> is playing
  useEffect(() => {
    if (engine !== 'native' || !isPlaying) return;
    let rafId = 0;
    const tick = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [engine, isPlaying]);

  // Pause master when an individual beat audition starts
  useEffect(() => {
    if (stopMasterSignal > 0) {
      audioRef.current?.pause();
      webAudioRef.current?.pause();
    }
  }, [stopMasterSignal]);

  // Handle jump-to-beat requests
  useEffect(() => {
    if (!seekRequest || !hasAudio) return;
    setPlaybackNotice(null);
    onWillStartMasterPlay?.();

    if (engine === 'native' && audioRef.current) {
      const audio = audioRef.current;
      audio.currentTime = seekRequest.timeSec;
      setCurrentTime(seekRequest.timeSec);
      audio.play().catch(() => {
        setPlaybackNotice('Click Play Master or the native player below to start audio.');
      });
    } else if (webAudioRef.current) {
      webAudioRef.current.play(seekRequest.timeSec).catch(() => {
        setPlaybackNotice('Click Play Master to start audio.');
      });
    }
  }, [seekRequest, hasAudio, engine, onWillStartMasterPlay]);

  // Track active beat under playhead
  useEffect(() => {
    if (!markers.length) {
      onActiveBeatChange(null);
      return;
    }
    const matched = markers.find(
      (m) => currentTime >= m.startSec && currentTime <= m.endSec + 0.15
    );
    const nextBeatId = matched ? matched.beatId : null;
    if (nextBeatId !== activeBeatId) {
      onActiveBeatChange(nextBeatId);
    }
  }, [currentTime, markers, activeBeatId, onActiveBeatChange]);

  // Render HiDPI canvas waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const renderWaveform = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = container.clientWidth;
      const height = 92;

      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const effectiveDuration = actualDuration || durationSec || 1;
      const progressRatio = hasAudio
        ? Math.max(0, Math.min(1, currentTime / effectiveDuration))
        : 0;

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      if (markers.length > 1 && effectiveDuration > 0) {
        ctx.strokeStyle = '#cbd5e1';
        ctx.setLineDash([2, 3]);
        markers.slice(1).forEach((m) => {
          const x = (m.startSec / effectiveDuration) * width;
          ctx.beginPath();
          ctx.moveTo(x, 6);
          ctx.lineTo(x, height - 6);
          ctx.stroke();
        });
        ctx.setLineDash([]);
      }

      const bars = peaks.length > 0 ? peaks : [];
      if (bars.length > 0) {
        const gap = 2;
        const barWidth = Math.max(2, (width - gap * (bars.length - 1)) / bars.length);
        const step = barWidth + gap;

        bars.forEach((amp, i) => {
          const x = i * step;
          const barCenterRatio = (x + barWidth / 2) / width;
          const barHeight = Math.max(4, amp * (height - 20));
          const y = (height - barHeight) / 2;

          ctx.fillStyle = barCenterRatio <= progressRatio ? '#0d9488' : '#cbd5e1';
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 1.5);
          ctx.fill();
        });
      }

      if (hoveredTime !== null && hasAudio && effectiveDuration > 0) {
        const hx = (hoveredTime / effectiveDuration) * width;
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx, 0);
        ctx.lineTo(hx, height);
        ctx.stroke();
      }

      if (hasAudio) {
        const px = progressRatio * width;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px, 4);
        ctx.lineTo(px, height - 4);
        ctx.stroke();
      }
    };

    renderWaveform();

    const observer = new ResizeObserver(renderWaveform);
    observer.observe(container);
    return () => observer.disconnect();
  }, [peaks, currentTime, actualDuration, durationSec, hasAudio, markers, hoveredTime]);

  // If native <audio> hits a blob: media error, seamlessly try HTTPS /api/audio/:id.wav then Web Audio
  const handleNativeAudioError = async () => {
    if (!wavBytes || wavBytes.length <= 44) return;

    if (!triedHttpFallbackRef.current) {
      triedHttpFallbackRef.current = true;
      try {
        const res = await fetch('/api/audio/cache', {
          method: 'POST',
          headers: { 'Content-Type': 'audio/wav' },
          body: wavBytesToBlob(wavBytes),
        });
        if (res.ok) {
          const data = (await res.json()) as { url?: string };
          if (data.url && audioRef.current) {
            setNativeAudioUrl(data.url);
            audioRef.current.src = data.url;
            audioRef.current.load();
            return;
          }
        }
      } catch {
        // Proceed to Web Audio fallback
      }
    }

    setEngine('webaudio');
    setPlaybackNotice('Switched to Web Audio fallback engine. Click Play Master to listen.');
  };

  const handleSwitchEngine = (next: PlaybackEngine) => {
    if (next === engine) return;
    audioRef.current?.pause();
    webAudioRef.current?.pause();
    setIsPlaying(false);
    setEngine(next);
    setPlaybackNotice(null);

    if (next === 'native' && audioRef.current && nativeAudioUrl) {
      audioRef.current.src = nativeAudioUrl;
      audioRef.current.currentTime = currentTime;
      audioRef.current.load();
    } else if (next === 'webaudio' && webAudioRef.current) {
      webAudioRef.current.seek(currentTime);
    }
  };

  const togglePlay = async () => {
    if (!hasAudio) return;
    setPlaybackNotice(null);

    if (engine === 'native') {
      const audio = audioRef.current;
      if (!audio) return;
      if (!audio.paused) {
        audio.pause();
      } else {
        onWillStartMasterPlay?.();
        audio.muted = muted;
        audio.volume = muted ? 0 : volume;
        try {
          if (audio.ended || audio.currentTime >= (audio.duration || durationSec) - 0.05) {
            audio.currentTime = 0;
          }
          await audio.play();
        } catch (err: unknown) {
          // Try Web Audio fallback immediately if native play was rejected
          try {
            await unlockAudioContext();
            if (webAudioRef.current) {
              setEngine('webaudio');
              await webAudioRef.current.play(audio.currentTime || 0);
              return;
            }
          } catch {
            // Surface actionable message
          }
          setPlaybackNotice(
            err instanceof Error
              ? err.message
              : 'Browser blocked audio playback. Try clicking the native player below or opening the app in a new tab.'
          );
        }
      }
    } else {
      const player = webAudioRef.current;
      if (!player) return;
      if (isPlaying) {
        player.pause();
      } else {
        await unlockAudioContext();
        onWillStartMasterPlay?.();
        try {
          await player.play();
        } catch (err: unknown) {
          setPlaybackNotice(
            err instanceof Error
              ? err.message
              : 'Browser blocked Web Audio playback. Try switching to Standard Audio or opening in a new tab.'
          );
        }
      }
    }
  };

  const skipBy = (delta: number) => {
    if (!hasAudio) return;
    const total = actualDuration || durationSec;
    if (engine === 'native' && audioRef.current) {
      const next = Math.max(0, Math.min(total, audioRef.current.currentTime + delta));
      audioRef.current.currentTime = next;
      setCurrentTime(next);
    } else if (webAudioRef.current) {
      const next = Math.max(0, Math.min(total, webAudioRef.current.getCurrentTime() + delta));
      webAudioRef.current.seek(next);
    }
  };

  const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!hasAudio || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * (actualDuration || durationSec);
    setPlaybackNotice(null);

    if (engine === 'native' && audioRef.current) {
      const audio = audioRef.current;
      audio.currentTime = targetTime;
      setCurrentTime(targetTime);
      if (audio.paused) {
        onWillStartMasterPlay?.();
        audio.play().catch(() => {
          setPlaybackNotice('Click Play Master or the native audio bar below to listen.');
        });
      }
    } else if (webAudioRef.current) {
      await unlockAudioContext();
      if (isPlaying) {
        webAudioRef.current.seek(targetTime);
      } else {
        onWillStartMasterPlay?.();
        webAudioRef.current.play(targetTime).catch(() => {
          webAudioRef.current?.seek(targetTime);
        });
      }
    }
  };

  const handleCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!hasAudio || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoveredTime(ratio * (actualDuration || durationSec));
  };

  const handlePlayTestChime = async () => {
    setChimeStatus(null);
    const chimeBytes = generateTestChimeWavBytes();
    const chimeUrl = URL.createObjectURL(wavBytesToBlob(chimeBytes));
    const testAudio = new Audio(chimeUrl);
    testAudio.volume = 1.0;

    try {
      await testAudio.play();
      setChimeStatus(
        'Test chime played cleanly. If you still heard silence, your browser tab or preview window is muted — try "Open in New Tab".'
      );
      setTimeout(() => URL.revokeObjectURL(chimeUrl), 1500);
    } catch {
      URL.revokeObjectURL(chimeUrl);
      setChimeStatus(
        'Browser blocked audio inside this preview frame. Click "Open in New Tab" to play with full browser audio permissions.'
      );
    }
  };

  const effectiveDuration = actualDuration || durationSec;
  const currentBeatLabel = markers.find((m) => m.beatId === activeBeatId)?.title;

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-5 border-b border-slate-100">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 [text-wrap:balance]">
            {projectTitle}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>{dialectLabel}</span>
            <span aria-hidden="true">·</span>
            <span>
              {voiceName} ({voiceGender})
            </span>
            <span aria-hidden="true">·</span>
            <span>{paceLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{loudnessLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{modelLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{totalWordCount} words</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{Math.round(sampleRate / 1000)} kHz WAV</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {hasAudio && (
            <button
              type="button"
              onClick={onDownloadMaster}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download WAV
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void unlockAudioContext();
              onGenerateMaster();
            }}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Rendering...
              </>
            ) : (
              <>
                <Wand2 className="w-3.5 h-3.5" />
                {hasAudio ? 'Regenerate Master' : 'Generate Voice-Over'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Progress banner during synthesis */}
      {isGenerating && generationProgress && (
        <div className="mt-4 py-3 px-4 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="flex items-center justify-between text-xs text-slate-700 mb-2">
            <span className="font-medium">{generationProgress.label}</span>
            <span className="font-mono tabular-nums text-slate-500">
              {generationProgress.current} / {generationProgress.total}
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-600 transition-transform duration-300 origin-left"
              style={{
                transform: `scaleX(${Math.max(
                  0.06,
                  generationProgress.current / Math.max(1, generationProgress.total)
                )})`,
              }}
            />
          </div>
        </div>
      )}

      {/* Playback notice if browser pauses autoplay or encounters audio issue */}
      {playbackNotice && (
        <div className="mt-4 py-2.5 px-3.5 rounded-lg border border-amber-200 bg-amber-50 flex items-center justify-between gap-3 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>{playbackNotice}</span>
          </div>
          {isInIframe && (
            <a
              href={window.location.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-amber-900 underline hover:text-amber-700 whitespace-nowrap shrink-0"
            >
              Open in New Tab
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      {/* Waveform stage */}
      <div className="mt-5">
        {hasAudio ? (
          <div ref={containerRef} className="w-full relative">
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              onMouseMove={handleCanvasMove}
              onMouseLeave={() => setHoveredTime(null)}
              className="block w-full cursor-pointer rounded-md"
              aria-label="Master audio waveform timeline"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span className="truncate">
                {currentBeatLabel
                  ? `Now speaking: ${currentBeatLabel}`
                  : 'Click anywhere on the waveform to play from that point'}
              </span>
              <div className="flex items-center gap-2 font-mono tabular-nums shrink-0">
                {rmsDbfs !== null && peakDbfs !== null && (
                  <>
                    <span>{rmsDbfs.toFixed(1)} dB RMS</span>
                    <span aria-hidden="true">·</span>
                    <span>{peakDbfs.toFixed(1)} dBFS peak</span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <span>
                  {hoveredTime !== null
                    ? formatTimecode(hoveredTime)
                    : `${markers.length} ${markers.length === 1 ? 'take' : 'beats'}`}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-[112px] rounded-lg border border-dashed border-slate-200 bg-slate-50/70 flex flex-col items-center justify-center text-center px-6">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <Volume2 className="w-4 h-4 text-teal-600" />
              <span>Ready to synthesize {beatCount} directed beats</span>
            </div>
            <p className="mt-1 text-xs text-slate-500 max-w-lg">
              Click <strong className="font-medium text-slate-700">Generate Voice-Over</strong> for a 24 kHz WAV master with{' '}
              <strong className="font-medium text-slate-700">{loudnessLabel}</strong> loudness mastering.
            </p>
          </div>
        )}
      </div>

      {/* Transport bar */}
      <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!hasAudio}
            aria-label={isPlaying ? 'Pause master audio' : 'Play master audio'}
            className="h-10 px-4 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed inline-flex items-center gap-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Play Master
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => skipBy(-5)}
            disabled={!hasAudio}
            title="Rewind 5 seconds"
            className="h-10 px-2.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1 text-xs font-mono tabular-nums transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>5s</span>
          </button>

          <button
            type="button"
            onClick={() => skipBy(5)}
            disabled={!hasAudio}
            title="Forward 5 seconds"
            className="h-10 px-2.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1 text-xs font-mono tabular-nums transition-colors cursor-pointer"
          >
            <span>5s</span>
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <div className="ml-1 font-mono text-sm tabular-nums text-slate-900">
            <span>{formatTimecode(currentTime)}</span>
            <span className="text-slate-400 mx-1.5">/</span>
            <span className="text-slate-500">{formatTimecode(effectiveDuration)}</span>
          </div>
        </div>

        {/* Right transport controls: Speaker Volume + Auto-play + Speed + Sound Help */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? 'Unmute speaker' : 'Mute speaker'}
              className="p-1.5 text-slate-600 hover:text-slate-900 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
            >
              {muted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-red-600" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const next = Number(e.target.value);
                setVolume(next);
                if (next > 0 && muted) setMuted(false);
              }}
              aria-label="Monitor speaker volume"
              className="studio-slider w-20"
            />
          </div>

          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={autoPlayReady}
              onChange={(e) => setAutoPlayReady(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-600"
            />
            <span>Auto-play</span>
          </label>

          {/* Preview Speed segmented control */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">Speed</span>
            <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-lg">
              {SPEED_OPTIONS.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setPlaybackRate(rate)}
                  className={`px-2 py-1 text-xs font-mono tabular-nums rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    playbackRate === rate
                      ? 'bg-white text-slate-900 font-medium shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {rate.toFixed(1)}x
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAudioHelp((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>No sound?</span>
          </button>
        </div>
      </div>

      {/* Visible Native Browser Audio Bar (mounted persistently so native playback always works) */}
      <div className={hasAudio ? 'mt-4 pt-3 border-t border-slate-100' : 'hidden'}>
        <audio
          ref={audioRef}
          controls
          playsInline
          preload="auto"
          onPlay={() => {
            onWillStartMasterPlay?.();
            setIsPlaying(true);
            setPlaybackNotice(null);
          }}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onTimeUpdate={() => {
            if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
          }}
          onLoadedMetadata={() => {
            if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
              setActualDuration(audioRef.current.duration);
            }
          }}
          onVolumeChange={() => {
            if (audioRef.current) {
              setMuted(audioRef.current.muted);
              setVolume(audioRef.current.volume);
            }
          }}
          onError={() => {
            void handleNativeAudioError();
          }}
          className="w-full h-9 accent-teal-600"
        />
      </div>

      {/* Quiet inline audio troubleshooter when "No sound?" is toggled */}
      {showAudioHelp && (
        <div className="mt-3 p-3.5 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-slate-900">
              In-Browser Audio Check
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePlayTestChime}
                className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Play Test Chime
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSwitchEngine(engine === 'native' ? 'webaudio' : 'native')
                }
                className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
              >
                {engine === 'native' ? 'Try Web Audio Engine' : 'Use Standard Audio'}
              </button>
              <a
                href={typeof window !== 'undefined' ? window.location.href : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-teal-600 rounded-md hover:bg-teal-700 transition-colors"
              >
                Open in New Tab
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Downloaded WAV files play in your system media player, whereas embedded preview iframes can be muted by your browser tab, site mute settings, or iframe audio restrictions. Click <strong className="font-medium text-slate-700">Play Test Chime</strong> to test sound here, or <strong className="font-medium text-slate-700">Open in New Tab</strong> to bypass preview iframe audio limits.
          </p>
          {chimeStatus && (
            <p className="text-[11px] font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md px-2.5 py-1.5">
              {chimeStatus}
            </p>
          )}
        </div>
      )}
    </section>
  );
};
