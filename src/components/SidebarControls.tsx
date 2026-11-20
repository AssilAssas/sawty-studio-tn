import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CopyPlus,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type {
  AdProject,
  LoudnessPresetId,
  PacePreset,
  TtsModelId,
  VoiceGender,
} from '../data/scriptData';
import {
  AD_FORMATS,
  AD_STYLES,
  DIALECT_PRESETS,
  LOUDNESS_PRESETS,
  MODEL_OPTIONS,
  PACE_PRESETS,
  VOICE_OPTIONS,
} from '../data/scriptData';

export type DeliveryMode = 'directed-single' | 'multi-beat';

interface SidebarControlsProps {
  projects: AdProject[];
  activeProjectId: string;
  onSelectProject: (projectId: string) => void;
  onCreateBlankProject: () => void;
  onDuplicateProject: () => void;
  onDeleteProject: (projectId: string) => void;
  formatId: string;
  onFormatChange: (formatId: string) => void;
  styleId: string;
  onStyleChange: (styleId: string) => void;
  dialectId: string;
  onDialectChange: (dialectId: string) => void;
  voiceName: string;
  onVoiceChange: (voice: string) => void;
  paceId: PacePreset['id'];
  onPaceChange: (paceId: PacePreset['id']) => void;
  loudnessPreset: LoudnessPresetId;
  onLoudnessPresetChange: (preset: LoudnessPresetId) => void;
  gainDb: number;
  onGainDbChange: (db: number) => void;
  trimSilence: boolean;
  onTrimSilenceChange: (trim: boolean) => void;
  model: TtsModelId;
  onModelChange: (model: TtsModelId) => void;
  deliveryMode: DeliveryMode;
  onDeliveryModeChange: (mode: DeliveryMode) => void;
  voicePersonaOverride: string;
  onVoicePersonaOverrideChange: (persona: string) => void;
  effectivePersonaPreview: string;
  globalPauseScale: number;
  onGlobalPauseScaleChange: (scale: number) => void;
  onResetCurrentProject: () => void;
  canResetProject: boolean;
  canDeleteCurrentProject: boolean;
  beatCount: number;
}

export const SidebarControls: React.FC<SidebarControlsProps> = ({
  projects,
  activeProjectId,
  onSelectProject,
  onCreateBlankProject,
  onDuplicateProject,
  onDeleteProject,
  formatId,
  onFormatChange,
  styleId,
  onStyleChange,
  dialectId,
  onDialectChange,
  voiceName,
  onVoiceChange,
  paceId,
  onPaceChange,
  loudnessPreset,
  onLoudnessPresetChange,
  gainDb,
  onGainDbChange,
  trimSilence,
  onTrimSilenceChange,
  model,
  onModelChange,
  deliveryMode,
  onDeliveryModeChange,
  voicePersonaOverride,
  onVoicePersonaOverrideChange,
  effectivePersonaPreview,
  globalPauseScale,
  onGlobalPauseScaleChange,
  onResetCurrentProject,
  canResetProject,
  canDeleteCurrentProject,
  beatCount,
}) => {
  const [genderFilter, setGenderFilter] = useState<'all' | VoiceGender>('all');
  const [showAdvancedBrief, setShowAdvancedBrief] = useState(false);

  const visibleVoices = VOICE_OPTIONS.filter(
    (v) => genderFilter === 'all' || v.gender === genderFilter
  );

  const activeStyle = AD_STYLES.find((s) => s.id === styleId);
  const activeLoudness = LOUDNESS_PRESETS.find((l) => l.id === loudnessPreset);

  return (
    <aside className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
      {/* 1. Ad Project & Format Setup */}
      <div className="p-5 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Ad Campaign</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onCreateBlankProject}
              title="New blank ad project"
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              New
            </button>
            <button
              type="button"
              onClick={onDuplicateProject}
              title="Duplicate current project for A/B test"
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
            >
              <CopyPlus className="w-3.5 h-3.5" />
            </button>
            {canDeleteCurrentProject && (
              <button
                type="button"
                onClick={() => onDeleteProject(activeProjectId)}
                title="Delete custom project"
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="project-select" className="sr-only">
            Saved Ad Projects
          </label>
          <select
            id="project-select"
            value={activeProjectId}
            onChange={(e) => onSelectProject(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label
              htmlFor="format-select"
              className="block text-[11px] font-medium text-slate-500 mb-1"
            >
              Ad Format
            </label>
            <select
              id="format-select"
              value={formatId}
              onChange={(e) => onFormatChange(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
            >
              {AD_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label} ({f.durationBadge})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="dialect-select"
              className="block text-[11px] font-medium text-slate-500 mb-1"
            >
              Dialect / Language
            </label>
            <select
              id="dialect-select"
              value={dialectId}
              onChange={(e) => onDialectChange(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
            >
              {DIALECT_PRESETS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="style-select"
            className="block text-[11px] font-medium text-slate-500 mb-1"
          >
            Vocal Ad Style
          </label>
          <select
            id="style-select"
            value={styleId}
            onChange={(e) => onStyleChange(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
          >
            {AD_STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {activeStyle && (
            <p className="mt-1 text-[11px] text-slate-500 leading-snug">
              {activeStyle.summary}
            </p>
          )}
        </div>
      </div>

      {/* 2. Voice Cast, Gender & Speaking Pace */}
      <div className="p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Voice & Gender</h2>
          <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-md">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'female', label: 'Female' },
                { id: 'male', label: 'Male' },
              ] as const
            ).map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGenderFilter(g.id)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  genderFilter === g.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 space-y-1.5" role="radiogroup" aria-label="Voice Cast">
          {visibleVoices.map((voice) => {
            const selected = voiceName === voice.id;
            return (
              <button
                key={voice.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onVoiceChange(voice.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                  selected
                    ? 'border-teal-600 bg-teal-50/50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-900">
                      {voice.name}
                    </span>
                    <span className="text-[11px] text-slate-400">·</span>
                    <span className="text-[11px] text-slate-500 capitalize">
                      {voice.gender}
                    </span>
                  </div>
                  {voice.recommended && (
                    <span className="text-[11px] font-medium text-teal-700">
                      Default
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-600 truncate">
                  {voice.character}
                </div>
              </button>
            );
          })}
        </div>

        {/* Speaking Pace */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-medium text-slate-700">Speaking Pace</span>
            <span className="font-mono tabular-nums text-[11px] text-slate-500">
              ~{PACE_PRESETS.find((p) => p.id === paceId)?.wpm ?? 142} wpm
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-lg">
            {PACE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPaceChange(p.id)}
                className={`px-1.5 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  paceId === p.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Audio Volume & Broadcast Mastering (Local real-time DSP, 0 API calls) */}
      <div className="p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Volume & Mastering</h2>
          <span className="text-[11px] text-slate-400">Instant · Local DSP</span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
          {LOUDNESS_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onLoudnessPresetChange(preset.id)}
              className={`px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                loudnessPreset === preset.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {preset.shortLabel}
            </button>
          ))}
        </div>
        {activeLoudness && (
          <p className="mt-1.5 text-[11px] text-slate-500 leading-snug">
            {activeLoudness.description}
          </p>
        )}

        {/* Output Gain Slider */}
        <div className="mt-3.5">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <label htmlFor="output-gain" className="font-medium text-slate-700">
              Output Volume Boost
            </label>
            <div className="flex items-center gap-2">
              <span className="font-mono tabular-nums text-[11px] text-slate-700">
                {gainDb > 0 ? `+${gainDb}` : gainDb} dB
              </span>
              {gainDb !== 0 && (
                <button
                  type="button"
                  onClick={() => onGainDbChange(0)}
                  className="text-[11px] text-teal-700 hover:text-teal-800 cursor-pointer"
                >
                  0 dB
                </button>
              )}
            </div>
          </div>
          <input
            id="output-gain"
            type="range"
            min={-6}
            max={12}
            step={1}
            value={gainDb}
            onChange={(e) => onGainDbChange(Number(e.target.value))}
            className="studio-slider w-full"
          />
          <div className="flex justify-between text-[10px] font-mono tabular-nums text-slate-400 mt-1">
            <span>-6 dB</span>
            <span>0 dB</span>
            <span>+12 dB (limited)</span>
          </div>
        </div>

        {/* Dead-Air Trim Toggle */}
        <label className="mt-3.5 pt-3 border-t border-slate-100 flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={trimSilence}
            onChange={(e) => onTrimSilenceChange(e.target.checked)}
            className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-600"
          />
          <span className="text-xs text-slate-700 leading-snug">
            <span className="font-medium text-slate-900">Trim dead air (0.0s hook)</span>
            <span className="block text-[11px] text-slate-500 mt-0.5">
              Cuts leading/trailing silence so Meta & TikTok hooks hit instantly.
            </span>
          </span>
        </label>
      </div>

      {/* 4. Synthesis Engine, Mastering Mode & Voice Brief */}
      <div className="p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Engine & Quota Mode</h2>
          <div className="mt-2.5 grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
            {MODEL_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onModelChange(opt.id)}
                className={`px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  model === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => onDeliveryModeChange('directed-single')}
              className={`px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                deliveryMode === 'directed-single'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1-Request Master
            </button>
            <button
              type="button"
              onClick={() => onDeliveryModeChange('multi-beat')}
              className={`px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                deliveryMode === 'multi-beat'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {beatCount}-Beat Stitched
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500 leading-snug">
            {deliveryMode === 'directed-single'
              ? '1 API call for all beats — saves quota and maintains seamless tone.'
              : `Renders ${beatCount} separate clips so you can adjust pauses and retake single beats.`}
          </p>

          {deliveryMode === 'multi-beat' && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="pause-scale" className="font-medium text-slate-700">
                  Scene Breath Pacing
                </label>
                <span className="font-mono tabular-nums text-[11px] text-slate-600">
                  {Math.round(globalPauseScale * 100)}%
                </span>
              </div>
              <input
                id="pause-scale"
                type="range"
                min={0.4}
                max={1.6}
                step={0.1}
                value={globalPauseScale}
                onChange={(e) => onGlobalPauseScaleChange(Number(e.target.value))}
                className="studio-slider w-full"
              />
            </div>
          )}
        </div>

        {/* Collapsible Voice Persona Brief */}
        <div className="pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setShowAdvancedBrief((prev) => !prev)}
            className="w-full flex items-center justify-between text-xs font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
          >
            <span>Voice & Accent Brief</span>
            {showAdvancedBrief ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>

          {showAdvancedBrief && (
            <div className="mt-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  {voicePersonaOverride.trim()
                    ? 'Custom override active'
                    : 'Auto-generated from format, style, dialect & pace'}
                </span>
                {voicePersonaOverride.trim() && (
                  <button
                    type="button"
                    onClick={() => onVoicePersonaOverrideChange('')}
                    className="text-[11px] font-medium text-teal-700 hover:text-teal-800 cursor-pointer"
                  >
                    Use Auto
                  </button>
                )}
              </div>
              <textarea
                rows={5}
                value={voicePersonaOverride || effectivePersonaPreview}
                onChange={(e) => onVoicePersonaOverrideChange(e.target.value)}
                aria-label="Voice and Accent Brief"
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-[11px] text-slate-700 leading-relaxed focus:bg-white focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15 resize-y"
              />
            </div>
          )}

          {canResetProject && (
            <button
              type="button"
              onClick={onResetCurrentProject}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restore Original Template
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
