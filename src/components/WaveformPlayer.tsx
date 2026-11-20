import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  Wand2,
} from 'lucide-react';
import type { StitchedBeatMarker } from '../utils/wavUtils';
import { formatTimecode } from '../utils/wavUtils';

interface WaveformPlayerProps {
  projectTitle: string;
  dialectLabel: string;
  paceLabel: string;
  loudnessLabel: string;
  peakDbfs: number | null;
  rmsDbfs: number | null;
  audioUrl: string | null;
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
  audioUrl,
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
  seekRequest,
  totalWordCount,
  beatCount,
  voiceName,
  voiceGender,
  modelLabel,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [actualDuration, setActualDuration] = useState(durationSec);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);

  useEffect(() => {
    setActualDuration(durationSec);
    setCurrentTime(0);
    setIsPlaying(false);
  }, [audioUrl, durationSec]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [playbackRate, audioUrl]);

  useEffect(() => {
    if (!seekRequest || !audioRef.current || !audioUrl) return;
    const audio = audioRef.current;
    audio.currentTime = Math.max(0, Math.min(seekRequest.timeSec, actualDuration || durationSec));
    setCurrentTime(audio.currentTime);
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  }, [seekRequest, audioUrl, actualDuration, durationSec]);

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
      const progressRatio = audioUrl
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

      if (hoveredTime !== null && audioUrl && effectiveDuration > 0) {
        const hx = (hoveredTime / effectiveDuration) * width;
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx, 0);
        ctx.lineTo(hx, height);
        ctx.stroke();
      }

      if (audioUrl) {
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
  }, [peaks, currentTime, actualDuration, durationSec, audioUrl, markers, hoveredTime]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const skipBy = (delta: number) => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    const next = Math.max(0, Math.min(actualDuration || durationSec, audio.currentTime + delta));
    audio.currentTime = next;
    setCurrentTime(next);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audioUrl || !audioRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * (actualDuration || durationSec);
    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const handleCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audioUrl || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoveredTime(ratio * (actualDuration || durationSec));
  };

  const effectiveDuration = actualDuration || durationSec;
  const currentBeatLabel = markers.find((m) => m.beatId === activeBeatId)?.title;

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            if (Number.isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0) {
              setActualDuration(e.currentTarget.duration);
            }
          }}
          onEnded={() => setIsPlaying(false)}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
        />
      )}

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
          {audioUrl && (
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
            onClick={onGenerateMaster}
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
                {audioUrl ? 'Regenerate Master' : 'Generate Voice-Over'}
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

      {/* Waveform stage */}
      <div className="mt-5">
        {audioUrl ? (
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
                  : 'Click anywhere on the waveform to scrub'}
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
              <strong className="font-medium text-slate-700">{loudnessLabel}</strong> loudness mastering, or switch formats and voices in the left studio rail.
            </p>
          </div>
        )}
      </div>

      {/* Transport bar */}
      <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!audioUrl}
            aria-label={isPlaying ? 'Pause master audio' : 'Play master audio'}
            className="w-10 h-10 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => skipBy(-5)}
            disabled={!audioUrl}
            title="Rewind 5 seconds"
            className="h-10 px-2.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1 text-xs font-mono tabular-nums transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>5s</span>
          </button>

          <button
            type="button"
            onClick={() => skipBy(5)}
            disabled={!audioUrl}
            title="Forward 5 seconds"
            className="h-10 px-2.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1 text-xs font-mono tabular-nums transition-colors cursor-pointer"
          >
            <span>5s</span>
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <div className="ml-2 font-mono text-sm tabular-nums text-slate-900">
            <span>{formatTimecode(currentTime)}</span>
            <span className="text-slate-400 mx-1.5">/</span>
            <span className="text-slate-500">{formatTimecode(effectiveDuration)}</span>
          </div>
        </div>

        {/* Preview Speed segmented control */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Preview Speed</span>
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
      </div>
    </section>
  );
};
