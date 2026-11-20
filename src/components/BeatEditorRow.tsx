import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { ScriptBeat } from '../data/scriptData';
import { countScriptWords } from '../data/scriptData';
import { formatTimecode } from '../utils/wavUtils';

export interface BeatAudioState {
  wavBytes: Uint8Array;
  blobUrl: string;
  durationSec: number;
  voiceName: string;
  model: string;
}

interface BeatEditorRowProps {
  beat: ScriptBeat;
  scriptDir: 'rtl' | 'ltr';
  langCode: string;
  audioState?: BeatAudioState;
  isGenerating: boolean;
  isPlayingBeat: boolean;
  isMasterCurrent: boolean;
  isLast: boolean;
  canDelete: boolean;
  onUpdateBeat: (id: string, patch: Partial<ScriptBeat>) => void;
  onDeleteBeat: (id: string) => void;
  onSynthesizeBeat: (beat: ScriptBeat) => void;
  onTogglePlayBeat: (beatId: string) => void;
  onSeekInMaster?: (beatId: string) => void;
  onDownloadBeat: (beat: ScriptBeat) => void;
}

export const BeatEditorRow: React.FC<BeatEditorRowProps> = ({
  beat,
  scriptDir,
  langCode,
  audioState,
  isGenerating,
  isPlayingBeat,
  isMasterCurrent,
  isLast,
  canDelete,
  onUpdateBeat,
  onDeleteBeat,
  onSynthesizeBeat,
  onTogglePlayBeat,
  onSeekInMaster,
  onDownloadBeat,
}) => {
  const [showDirection, setShowDirection] = useState(false);
  const words = countScriptWords(beat.text);

  return (
    <div
      className={`py-5 px-6 transition-colors ${
        !isLast ? 'border-b border-slate-200' : ''
      } ${isMasterCurrent ? 'bg-teal-50/40' : 'bg-white'}`}
    >
      {/* Row header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <h3 className="text-base font-semibold text-slate-900">
              {String(beat.index).padStart(2, '0')}. {beat.title}
            </h3>
            {isMasterCurrent && (
              <span className="text-xs font-medium text-teal-700">
                Playing in master
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
            <span>{beat.actLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{words} words</span>
            {audioState ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-700">
                  {formatTimecode(audioState.durationSec)}
                </span>
              </>
            ) : (
              <>
                <span aria-hidden="true">·</span>
                <span>Not rendered yet</span>
              </>
            )}
            {!isLast && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {beat.pauseAfterMs}ms pause after
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {audioState && (
            <button
              type="button"
              onClick={() => onTogglePlayBeat(beat.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isPlayingBeat
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {isPlayingBeat ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Audition
                </>
              )}
            </button>
          )}

          {onSeekInMaster && (
            <button
              type="button"
              onClick={() => onSeekInMaster(beat.id)}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Jump in Master
            </button>
          )}

          <button
            type="button"
            onClick={() => onSynthesizeBeat(beat)}
            disabled={isGenerating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                Rendering
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                {audioState ? 'Retake' : 'Render Beat'}
              </>
            )}
          </button>

          {audioState && (
            <button
              type="button"
              onClick={() => onDownloadBeat(beat)}
              title="Download this beat as WAV"
              aria-label={`Download beat ${beat.index} WAV`}
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={() => onDeleteBeat(beat.id)}
              title="Remove this beat"
              aria-label={`Delete beat ${beat.index}`}
              className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg border border-transparent hover:border-slate-200 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Direction note summary + toggle */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowDirection((prev) => !prev)}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
        >
          {showDirection ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
          <span className="font-medium text-slate-700">Direction:</span>
          <span className="truncate max-w-xl text-left">{beat.direction}</span>
        </button>

        {showDirection && (
          <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-[1fr_200px] gap-4">
            <div className="space-y-2.5">
              <div>
                <label
                  htmlFor={`title-${beat.id}`}
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Beat Label
                </label>
                <input
                  id={`title-${beat.id}`}
                  type="text"
                  value={beat.title}
                  onChange={(e) =>
                    onUpdateBeat(beat.id, {
                      title: e.target.value,
                      actLabel: `Beat ${beat.index} · ${e.target.value}`,
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
                />
              </div>
              <div>
                <label
                  htmlFor={`direction-${beat.id}`}
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Vocal Delivery Cue
                </label>
                <textarea
                  id={`direction-${beat.id}`}
                  rows={2}
                  value={beat.direction}
                  onChange={(e) => onUpdateBeat(beat.id, { direction: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 leading-relaxed focus:bg-white focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
                />
              </div>
            </div>

            {!isLast && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor={`pause-${beat.id}`}
                    className="text-xs font-medium text-slate-700"
                  >
                    Pause After Beat
                  </label>
                  <span className="text-xs font-mono tabular-nums text-slate-600">
                    {beat.pauseAfterMs}ms
                  </span>
                </div>
                <input
                  id={`pause-${beat.id}`}
                  type="range"
                  min={0}
                  max={1200}
                  step={50}
                  value={beat.pauseAfterMs}
                  onChange={(e) =>
                    onUpdateBeat(beat.id, { pauseAfterMs: Number(e.target.value) })
                  }
                  className="studio-slider w-full mt-2"
                />
                <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-400 mt-1">
                  <span>0ms</span>
                  <span>600ms</span>
                  <span>1200ms</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Script Editor (auto RTL for Arabic dialects, LTR for French/English) */}
      <div className="mt-3.5">
        <textarea
          dir={scriptDir}
          lang={langCode}
          value={beat.text}
          onChange={(e) => onUpdateBeat(beat.id, { text: e.target.value })}
          rows={Math.max(
            2,
            Math.ceil(beat.text.length / 72) + (beat.text.split('\n').length - 1)
          )}
          aria-label={`Script text for beat ${beat.index}`}
          className={`w-full rounded-lg border border-slate-200 bg-slate-50/40 px-4 py-3 text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15 resize-y transition-colors ${
            scriptDir === 'rtl'
              ? 'font-arabic text-[17px] leading-[1.9]'
              : 'text-[15px] leading-[1.7]'
          }`}
        />
      </div>
    </div>
  );
};
