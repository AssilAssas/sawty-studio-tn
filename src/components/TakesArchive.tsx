import React from 'react';
import { Download, Play, Trash2 } from 'lucide-react';
import type { StitchedBeatMarker } from '../utils/wavUtils';
import { formatTimecode } from '../utils/wavUtils';

export interface SavedTake {
  id: string;
  takeNumber: number;
  projectName: string;
  createdAt: string;
  voiceName: string;
  voiceGender: string;
  modelLabel: string;
  modeLabel: string;
  paceLabel: string;
  loudnessLabel: string;
  durationSec: number;
  sampleRate: number;
  rawWavBytes: Uint8Array;
  wavBytes: Uint8Array;
  blobUrl: string;
  peaks: number[];
  markers: StitchedBeatMarker[];
}

interface TakesArchiveProps {
  takes: SavedTake[];
  activeTakeId: string | null;
  onLoadTake: (take: SavedTake) => void;
  onDownloadTake: (take: SavedTake) => void;
  onDeleteTake: (takeId: string) => void;
  onGenerateNew: () => void;
}

export const TakesArchive: React.FC<TakesArchiveProps> = ({
  takes,
  activeTakeId,
  onLoadTake,
  onDownloadTake,
  onDeleteTake,
  onGenerateNew,
}) => {
  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="p-6 border-b border-slate-200 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Session Takes</h2>
          <p className="mt-1 text-xs text-slate-500">
            Compare generated voice-over takes across male/female voices, styles, paces, and hooks before exporting your winning WAV.
          </p>
        </div>
        <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
          {takes.length} {takes.length === 1 ? 'take' : 'takes'}
        </span>
      </div>

      {takes.length === 0 ? (
        <div className="py-14 px-6 text-center">
          <p className="text-sm font-medium text-slate-900">No takes recorded yet</p>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
            Generate your first master take to audition and compare voice variations, hooks, and volume presets here.
          </p>
          <button
            type="button"
            onClick={onGenerateNew}
            className="mt-4 inline-flex items-center px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors cursor-pointer"
          >
            Generate First Take
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {takes.map((take) => {
            const isLoaded = take.id === activeTakeId;
            return (
              <div
                key={take.id}
                className={`px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-colors ${
                  isLoaded ? 'bg-teal-50/40' : 'hover:bg-slate-50/60'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">
                      Take {String(take.takeNumber).padStart(2, '0')} · {take.projectName}
                    </span>
                    {isLoaded && (
                      <span className="text-xs font-medium text-teal-700">
                        Loaded in deck
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                    <span>
                      {take.voiceName} ({take.voiceGender})
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{take.paceLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>{take.loudnessLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>{take.modelLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>{take.modeLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums text-slate-700">
                      {formatTimecode(take.durationSec)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{take.createdAt}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onLoadTake(take)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Load & Play
                  </button>
                  <button
                    type="button"
                    onClick={() => onDownloadTake(take)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    WAV
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTake(take.id)}
                    aria-label={`Delete Take ${take.takeNumber}`}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg border border-transparent hover:border-slate-200 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
