import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ClipboardPaste,
  Copy,
  Info,
  Loader2,
  Plus,
  Scissors,
  Sparkles,
  X,
} from 'lucide-react';
import {
  AD_FORMATS,
  AD_STYLES,
  BUILT_IN_PROJECTS,
  DIALECT_PRESETS,
  LOUDNESS_PRESETS,
  MODEL_OPTIONS,
  PACE_PRESETS,
  VOICE_OPTIONS,
  buildEffectivePersona,
  countScriptWords,
  estimateDurationSeconds,
} from './data/scriptData';
import type {
  AdProject,
  LoudnessPresetId,
  PacePreset,
  ScriptBeat,
  TtsModelId,
} from './data/scriptData';
import {
  applyAudioMastering,
  base64ToUint8Array,
  extractWaveformPeaks,
  formatShortDuration,
  parseWavBuffer,
  stitchWavClips,
  triggerWavDownload,
  wavBytesToBlob,
} from './utils/wavUtils';
import type { StitchedBeatMarker } from './utils/wavUtils';
import { WebAudioPcmPlayer, unlockAudioContext } from './utils/audioPlayer';
import { WaveformPlayer } from './components/WaveformPlayer';
import { BeatEditorRow } from './components/BeatEditorRow';
import type { BeatAudioState } from './components/BeatEditorRow';
import { SidebarControls } from './components/SidebarControls';
import type { DeliveryMode } from './components/SidebarControls';
import { PronunciationReference } from './components/PronunciationReference';
import { TakesArchive } from './components/TakesArchive';
import type { SavedTake } from './components/TakesArchive';
import { QuickBriefGenerator } from './components/QuickBriefGenerator';
import type { QuickBriefPayload } from './components/QuickBriefGenerator';

type WorkspaceTab = 'studio' | 'brief' | 'takes' | 'pronunciation';

const STORAGE_KEY = 'sawt_studio_projects_v1';

interface SynthesizeApiResponse {
  audioBase64?: string;
  mimeType?: string;
  model?: string;
  fallbackFrom?: string;
  error?: string;
}

interface HookVariant {
  angle: string;
  direction: string;
  text: string;
}

interface ScriptAssistResponse {
  projectTitle?: string;
  beats?: Array<{
    title: string;
    direction: string;
    text: string;
    pauseAfterMs?: number;
  }>;
  hooks?: HookVariant[];
  error?: string;
}

function loadInitialProjects(): AdProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return BUILT_IN_PROJECTS.map(cloneProject);
    const parsed = JSON.parse(raw) as AdProject[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return BUILT_IN_PROJECTS.map(cloneProject);
    }
    // Ensure the flagship Fenoa project always exists
    const hasFenoa = parsed.some((p) => p.id === 'fenoa-mini-vsl');
    if (!hasFenoa) {
      return [cloneProject(BUILT_IN_PROJECTS[0]), ...parsed];
    }
    return parsed;
  } catch {
    return BUILT_IN_PROJECTS.map(cloneProject);
  }
}

function cloneProject(project: AdProject): AdProject {
  return {
    ...project,
    beats: project.beats.map((b) => ({ ...b })),
  };
}

function normalizeBeats(
  rawBeats: Array<{
    id?: string;
    title: string;
    direction: string;
    text: string;
    pauseAfterMs?: number;
  }>
): ScriptBeat[] {
  return rawBeats.map((b, idx) => ({
    id: b.id || `beat-${Date.now()}-${idx + 1}`,
    index: idx + 1,
    actNumber: idx + 1,
    actLabel: `Beat ${idx + 1} · ${b.title}`,
    title: b.title || `Beat ${idx + 1}`,
    direction: b.direction || 'Natural, clear conversational delivery.',
    text: b.text,
    pauseAfterMs:
      idx === rawBeats.length - 1
        ? 0
        : typeof b.pauseAfterMs === 'number'
          ? Math.max(0, Math.min(1200, b.pauseAfterMs))
          : 400,
  }));
}

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('studio');
  const [projects, setProjects] = useState<AdProject[]>(loadInitialProjects);
  const [activeProjectId, setActiveProjectId] = useState<string>('fenoa-mini-vsl');

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? projects[0],
    [projects, activeProjectId]
  );

  // Studio engine & real-time local mastering settings
  const [model, setModel] = useState<TtsModelId>('gemini-3.8-flash-lite-tts');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('directed-single');
  const [globalPauseScale, setGlobalPauseScale] = useState<number>(1.0);
  const [loudnessPreset, setLoudnessPreset] = useState<LoudnessPresetId>('social-loud');
  const [gainDb, setGainDb] = useState<number>(0);
  const [trimSilence, setTrimSilence] = useState<boolean>(true);

  // Per-beat synthesized audio cache
  const [beatAudios, setBeatAudios] = useState<Record<string, BeatAudioState>>({});
  const [generatingBeatIds, setGeneratingBeatIds] = useState<Record<string, boolean>>({});

  // Master player state (raw unmastered bytes + locally mastered playback state)
  const [isGeneratingMaster, setIsGeneratingMaster] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{
    current: number;
    total: number;
    label: string;
  } | null>(null);
  const [rawMasterWavBytes, setRawMasterWavBytes] = useState<Uint8Array | null>(null);
  const [rawMasterMarkers, setRawMasterMarkers] = useState<StitchedBeatMarker[]>([]);
  const [rawMasterNonce, setRawMasterNonce] = useState<number>(0);
  const [masterGenNonce, setMasterGenNonce] = useState<number>(0);
  const [stopMasterSignal, setStopMasterSignal] = useState<number>(0);
  const [masterWavBytes, setMasterWavBytes] = useState<Uint8Array | null>(null);
  const [masterPeaks, setMasterPeaks] = useState<number[]>([]);
  const [masterDuration, setMasterDuration] = useState<number>(0);
  const [masterSampleRate, setMasterSampleRate] = useState<number>(24000);
  const [masterMarkers, setMasterMarkers] = useState<StitchedBeatMarker[]>([]);
  const [masterPeakDbfs, setMasterPeakDbfs] = useState<number | null>(null);
  const [masterRmsDbfs, setMasterRmsDbfs] = useState<number | null>(null);
  const [activeBeatId, setActiveBeatId] = useState<string | null>(null);
  const [seekRequest, setSeekRequest] = useState<{ timeSec: number; nonce: number } | null>(
    null
  );

  // Takes archive
  const [takes, setTakes] = useState<SavedTake[]>([]);
  const [activeTakeId, setActiveTakeId] = useState<string | null>(null);
  const takeCounterRef = useRef<number>(0);

  // Beat audition players (native HTMLAudio primary + Web Audio fallback)
  const beatHtmlAudioRef = useRef<HTMLAudioElement | null>(null);
  const beatBlobUrlRef = useRef<string | null>(null);
  const beatPlayerRef = useRef<WebAudioPcmPlayer | null>(null);
  const [playingBeatId, setPlayingBeatId] = useState<string | null>(null);

  // E-com fast workflow panels
  const [showPastePanel, setShowPastePanel] = useState(false);
  const [rawPasteText, setRawPasteText] = useState('');
  const [hookVariants, setHookVariants] = useState<HookVariant[] | null>(null);
  const [busyAssistAction, setBusyAssistAction] = useState<
    'generate' | 'split' | 'tighten' | 'hooks' | null
  >(null);

  // UI feedback
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);
  const [copiedMode, setCopiedMode] = useState<'clean' | 'tagged' | null>(null);

  // Persist projects cleanly to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch {
      // Ignore storage quota errors
    }
  }, [projects]);

  const updateActiveProject = useCallback(
    (updater: (prev: AdProject) => AdProject) => {
      setProjects((prevList) =>
        prevList.map((proj) =>
          proj.id === activeProject.id
            ? { ...updater(proj), updatedAt: Date.now() }
            : proj
        )
      );
    },
    [activeProject.id]
  );

  // Derived active metadata
  const activeFormat =
    AD_FORMATS.find((f) => f.id === activeProject.formatId) ?? AD_FORMATS[0];
  const activeStyle =
    AD_STYLES.find((s) => s.id === activeProject.styleId) ?? AD_STYLES[0];
  const activeDialect =
    DIALECT_PRESETS.find((d) => d.id === activeProject.dialectId) ?? DIALECT_PRESETS[0];
  const activeVoice =
    VOICE_OPTIONS.find((v) => v.id === activeProject.voiceName) ?? VOICE_OPTIONS[0];
  const activePace =
    PACE_PRESETS.find((p) => p.id === activeProject.paceId) ?? PACE_PRESETS[1];
  const activeLoudness =
    LOUDNESS_PRESETS.find((l) => l.id === loudnessPreset) ?? LOUDNESS_PRESETS[0];
  const modelLabel =
    MODEL_OPTIONS.find((m) => m.id === model)?.label ?? 'Flash Lite TTS';

  const effectivePersona = useMemo(
    () =>
      buildEffectivePersona({
        voiceName: activeProject.voiceName,
        dialectId: activeProject.dialectId,
        styleId: activeProject.styleId,
        formatId: activeProject.formatId,
        paceId: activeProject.paceId,
        customPersonaOverride: activeProject.voicePersonaOverride,
      }),
    [
      activeProject.voiceName,
      activeProject.dialectId,
      activeProject.styleId,
      activeProject.formatId,
      activeProject.paceId,
      activeProject.voicePersonaOverride,
    ]
  );

  const totalWordCount = useMemo(
    () =>
      activeProject.beats.reduce((sum, beat) => sum + countScriptWords(beat.text), 0),
    [activeProject.beats]
  );

  const estimatedDurationSec = useMemo(
    () =>
      estimateDurationSeconds(
        activeProject.beats,
        activeProject.paceId,
        deliveryMode === 'multi-beat' ? globalPauseScale : 0.7
      ),
    [activeProject.beats, activeProject.paceId, deliveryMode, globalPauseScale]
  );

  const isOverFormatTarget = estimatedDurationSec > activeFormat.targetSeconds + 4;

  const builtInSource = useMemo(
    () => BUILT_IN_PROJECTS.find((p) => p.id === activeProject.id),
    [activeProject.id]
  );

  const canResetProject = useMemo(() => {
    if (!builtInSource) return false;
    return (
      JSON.stringify(builtInSource.beats) !== JSON.stringify(activeProject.beats) ||
      builtInSource.voicePersonaOverride !== activeProject.voicePersonaOverride ||
      builtInSource.formatId !== activeProject.formatId ||
      builtInSource.styleId !== activeProject.styleId ||
      builtInSource.dialectId !== activeProject.dialectId
    );
  }, [builtInSource, activeProject]);

  // Apply real-time local loudness mastering DSP whenever rawMasterWavBytes or mastering controls change (0 API calls!)
  useEffect(() => {
    if (!rawMasterWavBytes) return;

    const mastered = applyAudioMastering(rawMasterWavBytes, {
      preset: loudnessPreset,
      gainDb,
      trimSilence,
    });
    const peaks = extractWaveformPeaks(mastered.wavBytes, 150);
    const shiftedMarkers = rawMasterMarkers.map((m) => ({
      ...m,
      startSec: Math.max(0, m.startSec - mastered.trimmedStartSec),
      endSec: Math.min(
        mastered.durationSec,
        Math.max(0, m.endSec - mastered.trimmedStartSec)
      ),
    }));

    URL.revokeObjectURL(mastered.blobUrl);
    setMasterWavBytes(mastered.wavBytes);
    setMasterGenNonce(rawMasterNonce);
    setMasterPeaks(peaks);
    setMasterDuration(mastered.durationSec);
    setMasterSampleRate(mastered.sampleRate);
    setMasterPeakDbfs(mastered.peakDbfs);
    setMasterRmsDbfs(mastered.rmsDbfs);
    setMasterMarkers(shiftedMarkers);
  }, [rawMasterWavBytes, rawMasterMarkers, rawMasterNonce, loudnessPreset, gainDb, trimSilence]);

  const stopBeatPreview = useCallback(() => {
    if (beatHtmlAudioRef.current) {
      beatHtmlAudioRef.current.pause();
      beatHtmlAudioRef.current.currentTime = 0;
    }
    beatPlayerRef.current?.stop();
    setPlayingBeatId(null);
  }, []);

  useEffect(() => {
    const player = new WebAudioPcmPlayer({
      onEnded: () => setPlayingBeatId(null),
    });
    beatPlayerRef.current = player;
    return () => {
      if (beatHtmlAudioRef.current) {
        beatHtmlAudioRef.current.pause();
        beatHtmlAudioRef.current.removeAttribute('src');
        beatHtmlAudioRef.current = null;
      }
      if (beatBlobUrlRef.current) {
        URL.revokeObjectURL(beatBlobUrlRef.current);
        beatBlobUrlRef.current = null;
      }
      player.dispose();
      beatPlayerRef.current = null;
    };
  }, []);

  const callSynthesizeApi = useCallback(
    async (
      segments: Array<{ text: string; style: string }>
    ): Promise<{ wavBytes: Uint8Array; effectiveModel: string }> => {
      const response = await fetch('/api/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments,
          voiceName: activeProject.voiceName,
          model,
        }),
      });

      const rawText = await response.text();
      let payload: SynthesizeApiResponse = {};
      if (rawText) {
        try {
          payload = JSON.parse(rawText) as SynthesizeApiResponse;
        } catch {
          throw new Error(
            `Unexpected server response (HTTP ${response.status}). Please retry.`
          );
        }
      }
      if (!response.ok || !payload.audioBase64) {
        throw new Error(
          payload.error || `Synthesis failed with status ${response.status}.`
        );
      }

      if (payload.fallbackFrom) {
        setInfoNotice(
          'Flash TTS reached its free-tier daily quota (10 requests/day) — synthesized automatically with Flash Lite TTS.'
        );
      }

      return {
        wavBytes: base64ToUint8Array(payload.audioBase64),
        effectiveModel: payload.model || model,
      };
    },
    [activeProject.voiceName, model]
  );

  const callScriptAssistApi = useCallback(
    async (payloadBody: Record<string, unknown>): Promise<ScriptAssistResponse> => {
      const response = await fetch('/api/script/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadBody),
      });

      const rawText = await response.text();
      let data: ScriptAssistResponse = {};
      if (rawText) {
        try {
          data = JSON.parse(rawText) as ScriptAssistResponse;
        } catch {
          throw new Error(`Unexpected response (HTTP ${response.status}).`);
        }
      }
      if (!response.ok) {
        throw new Error(data.error || `Script assistant failed (HTTP ${response.status}).`);
      }
      return data;
    },
    []
  );

  const recordTake = useCallback(
    (params: {
      rawBytes: Uint8Array;
      markers: StitchedBeatMarker[];
      effectiveModel: string;
      modeLabel: string;
    }) => {
      const mastered = applyAudioMastering(params.rawBytes, {
        preset: loudnessPreset,
        gainDb,
        trimSilence,
      });
      const peaks = extractWaveformPeaks(mastered.wavBytes, 150);
      const effectiveModelLabel =
        MODEL_OPTIONS.find((m) => m.id === params.effectiveModel)?.label ?? modelLabel;

      takeCounterRef.current += 1;
      const takeNum = takeCounterRef.current;
      const newTake: SavedTake = {
        id: `take-${Date.now()}-${takeNum}`,
        takeNumber: takeNum,
        projectName: activeProject.name,
        createdAt: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        voiceName: activeVoice.name,
        voiceGender: activeVoice.gender,
        modelLabel: effectiveModelLabel,
        modeLabel: params.modeLabel,
        paceLabel: activePace.label,
        loudnessLabel: activeLoudness.shortLabel,
        durationSec: mastered.durationSec,
        sampleRate: mastered.sampleRate,
        rawWavBytes: params.rawBytes,
        wavBytes: mastered.wavBytes,
        blobUrl: mastered.blobUrl,
        peaks,
        markers: params.markers,
      };
      setTakes((prev) => [newTake, ...prev]);
      setActiveTakeId(newTake.id);
    },
    [
      loudnessPreset,
      gainDb,
      trimSilence,
      modelLabel,
      activeProject.name,
      activeVoice.name,
      activeVoice.gender,
      activePace.label,
      activeLoudness.shortLabel,
    ]
  );

  const buildMasterFromBeatMap = useCallback(
    (
      currentBeats: ScriptBeat[],
      audioMap: Record<string, BeatAudioState>,
      pauseScale: number,
      shouldRecordTake: boolean,
      effectiveModelId?: string
    ) => {
      const readyClips = currentBeats
        .map((beat) => {
          const state = audioMap[beat.id];
          if (!state) return null;
          return {
            beatId: beat.id,
            title: `${String(beat.index).padStart(2, '0')}. ${beat.title}`,
            wavBytes: state.wavBytes,
            pauseAfterMs: Math.round(beat.pauseAfterMs * pauseScale),
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);

      if (readyClips.length === 0) return;

      const stitched = stitchWavClips(readyClips);
      URL.revokeObjectURL(stitched.blobUrl);
      setRawMasterWavBytes(stitched.wavBytes);
      setRawMasterMarkers(stitched.markers);

      if (shouldRecordTake) {
        setRawMasterNonce((n) => n + 1);
        recordTake({
          rawBytes: stitched.wavBytes,
          markers: stitched.markers,
          effectiveModel: effectiveModelId || model,
          modeLabel:
            readyClips.length === currentBeats.length
              ? `${currentBeats.length}-Beat Stitched`
              : `${readyClips.length}/${currentBeats.length} Beats`,
        });
      }
    },
    [model, recordTake]
  );

  const handleSynthesizeSingleBeat = useCallback(
    async (beat: ScriptBeat) => {
      void unlockAudioContext();
      setErrorMessage(null);
      setInfoNotice(null);
      setGeneratingBeatIds((prev) => ({ ...prev, [beat.id]: true }));

      try {
        const combinedStyle = `${effectivePersona}\n\nBeat Direction (${beat.actLabel}): ${beat.direction.trim()}`;
        const { wavBytes, effectiveModel } = await callSynthesizeApi([
          { text: beat.text, style: combinedStyle },
        ]);
        const masteredBeat = applyAudioMastering(wavBytes, {
          preset: loudnessPreset,
          gainDb,
          trimSilence: false,
        });

        const newBeatAudio: BeatAudioState = {
          wavBytes,
          blobUrl: masteredBeat.blobUrl,
          durationSec: masteredBeat.durationSec,
          voiceName: activeProject.voiceName,
          model: effectiveModel,
        };

        setBeatAudios((prev) => {
          const nextMap = { ...prev, [beat.id]: newBeatAudio };
          const allRendered = activeProject.beats.every((b) => Boolean(nextMap[b.id]));
          if (allRendered) {
            buildMasterFromBeatMap(
              activeProject.beats,
              nextMap,
              globalPauseScale,
              true,
              effectiveModel
            );
          }
          return nextMap;
        });
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to synthesize this beat.'
        );
      } finally {
        setGeneratingBeatIds((prev) => ({ ...prev, [beat.id]: false }));
      }
    },
    [
      effectivePersona,
      callSynthesizeApi,
      loudnessPreset,
      gainDb,
      activeProject.voiceName,
      activeProject.beats,
      buildMasterFromBeatMap,
      globalPauseScale,
    ]
  );

  const handleGenerateMaster = useCallback(async () => {
    if (isGeneratingMaster) return;
    void unlockAudioContext();
    setErrorMessage(null);
    setInfoNotice(null);
    stopBeatPreview();
    setActiveTab('studio');
    setIsGeneratingMaster(true);

    const currentBeats = activeProject.beats.filter((b) => b.text.trim().length > 0);
    if (currentBeats.length === 0) {
      setErrorMessage('Add script text to at least one beat before generating.');
      setIsGeneratingMaster(false);
      return;
    }

    try {
      if (deliveryMode === 'directed-single') {
        setGenerationProgress({
          current: 1,
          total: 1,
          label: `Synthesizing ${currentBeats.length} directed beats (${activeVoice.name}, ${activePace.label})...`,
        });

        const segments = currentBeats.map((beat) => ({
          text: beat.text.trim(),
          style: `${effectivePersona}\n\nBeat Direction (${beat.actLabel}): ${beat.direction.trim()}`,
        }));

        const { wavBytes, effectiveModel } = await callSynthesizeApi(segments);
        const parsed = parseWavBuffer(wavBytes);

        const wordCounts = currentBeats.map((b) =>
          Math.max(1, countScriptWords(b.text))
        );
        const totalWords = wordCounts.reduce((a, b) => a + b, 0);
        let cursor = 0;
        const estimatedMarkers: StitchedBeatMarker[] = currentBeats.map((beat, idx) => {
          const sliceDuration = (wordCounts[idx] / totalWords) * parsed.durationSec;
          const marker: StitchedBeatMarker = {
            beatId: beat.id,
            title: `${String(beat.index).padStart(2, '0')}. ${beat.title}`,
            startSec: cursor,
            endSec: cursor + sliceDuration,
          };
          cursor += sliceDuration;
          return marker;
        });

        setRawMasterWavBytes(wavBytes);
        setRawMasterMarkers(estimatedMarkers);
        setRawMasterNonce((n) => n + 1);
        recordTake({
          rawBytes: wavBytes,
          markers: estimatedMarkers,
          effectiveModel,
          modeLabel: '1-Request Master',
        });
      } else {
        const nextMap: Record<string, BeatAudioState> = { ...beatAudios };
        let lastEffectiveModel: string = model;

        for (let i = 0; i < currentBeats.length; i++) {
          const beat = currentBeats[i];
          setGenerationProgress({
            current: i + 1,
            total: currentBeats.length,
            label: `Synthesizing ${String(beat.index).padStart(2, '0')}. ${beat.title}...`,
          });
          setGeneratingBeatIds((prev) => ({ ...prev, [beat.id]: true }));

          try {
            const combinedStyle = `${effectivePersona}\n\nBeat Direction (${beat.actLabel}): ${beat.direction.trim()}`;
            const { wavBytes, effectiveModel } = await callSynthesizeApi([
              { text: beat.text, style: combinedStyle },
            ]);
            lastEffectiveModel = effectiveModel;
            const parsed = parseWavBuffer(wavBytes);
            const blobUrl = URL.createObjectURL(wavBytesToBlob(wavBytes));

            nextMap[beat.id] = {
              wavBytes,
              blobUrl,
              durationSec: parsed.durationSec,
              voiceName: activeProject.voiceName,
              model: effectiveModel,
            };

            setBeatAudios({ ...nextMap });
          } finally {
            setGeneratingBeatIds((prev) => ({ ...prev, [beat.id]: false }));
          }
        }

        buildMasterFromBeatMap(
          currentBeats,
          nextMap,
          globalPauseScale,
          true,
          lastEffectiveModel
        );
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred during voice-over synthesis.'
      );
    } finally {
      setIsGeneratingMaster(false);
      setGenerationProgress(null);
    }
  }, [
    isGeneratingMaster,
    stopBeatPreview,
    activeProject.beats,
    activeProject.voiceName,
    deliveryMode,
    activeVoice.name,
    activePace.label,
    effectivePersona,
    callSynthesizeApi,
    recordTake,
    beatAudios,
    model,
    buildMasterFromBeatMap,
    globalPauseScale,
  ]);

  // E-com Fast Script Actions
  const handleQuickBriefGenerate = useCallback(
    async (brief: QuickBriefPayload) => {
      setErrorMessage(null);
      setInfoNotice(null);
      setBusyAssistAction('generate');

      const fmt = AD_FORMATS.find((f) => f.id === brief.formatId) ?? AD_FORMATS[0];
      const sty = AD_STYLES.find((s) => s.id === brief.styleId) ?? AD_STYLES[0];
      const dia =
        DIALECT_PRESETS.find((d) => d.id === brief.dialectId) ?? DIALECT_PRESETS[0];

      try {
        const res = await callScriptAssistApi({
          mode: 'generate',
          dialectLabel: dia.label,
          formatLabel: fmt.label,
          styleLabel: sty.label,
          targetSeconds: brief.targetSeconds,
          brief,
        });

        if (!res.beats || res.beats.length === 0) {
          throw new Error('No script beats were generated. Try adding more product details.');
        }

        const newProject: AdProject = {
          id: `proj-${Date.now()}`,
          name: res.projectTitle || `${brief.productName} — ${fmt.label}`,
          formatId: brief.formatId,
          styleId: brief.styleId,
          dialectId: brief.dialectId,
          voiceName: activeProject.voiceName,
          paceId: brief.targetSeconds <= 45 ? 'brisk' : 'natural',
          voicePersonaOverride: '',
          beats: normalizeBeats(res.beats),
          updatedAt: Date.now(),
        };

        setProjects((prev) => [newProject, ...prev]);
        setActiveProjectId(newProject.id);
        setBeatAudios({});
        setHookVariants(null);
        setActiveTab('studio');
        setInfoNotice(
          `Created "${newProject.name}" (${newProject.beats.length} directed beats). Click Generate Voice-Over to render audio.`
        );
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to generate script.'
        );
      } finally {
        setBusyAssistAction(null);
      }
    },
    [callScriptAssistApi, activeProject.voiceName]
  );

  const handlePasteSplit = useCallback(async () => {
    if (!rawPasteText.trim()) return;
    setErrorMessage(null);
    setInfoNotice(null);
    setBusyAssistAction('split');

    try {
      const res = await callScriptAssistApi({
        mode: 'split',
        rawScript: rawPasteText.trim(),
        dialectLabel: activeDialect.label,
        formatLabel: activeFormat.label,
        styleLabel: activeStyle.label,
        targetSeconds: activeFormat.targetSeconds,
      });

      if (!res.beats || res.beats.length === 0) {
        throw new Error('Could not split this script into beats.');
      }

      updateActiveProject((proj) => ({
        ...proj,
        beats: normalizeBeats(res.beats!),
      }));
      setBeatAudios({});
      setShowPastePanel(false);
      setRawPasteText('');
      setInfoNotice(
        `Structured pasted script into ${res.beats.length} phonetically tuned beats.`
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to structure script.');
    } finally {
      setBusyAssistAction(null);
    }
  }, [
    rawPasteText,
    callScriptAssistApi,
    activeDialect.label,
    activeFormat.label,
    activeFormat.targetSeconds,
    activeStyle.label,
    updateActiveProject,
  ]);

  const handleTightenToTarget = useCallback(async () => {
    setErrorMessage(null);
    setInfoNotice(null);
    setBusyAssistAction('tighten');

    try {
      const fullText = activeProject.beats.map((b) => b.text.trim()).join('\n\n');
      const res = await callScriptAssistApi({
        mode: 'tighten',
        rawScript: fullText,
        dialectLabel: activeDialect.label,
        formatLabel: activeFormat.label,
        styleLabel: activeStyle.label,
        targetSeconds: activeFormat.targetSeconds,
      });

      if (!res.beats || res.beats.length === 0) {
        throw new Error('Could not tighten script right now.');
      }

      updateActiveProject((proj) => ({
        ...proj,
        paceId: activeFormat.targetSeconds <= 115 ? 'brisk' : proj.paceId,
        beats: normalizeBeats(res.beats!),
      }));
      setBeatAudios({});
      setInfoNotice(
        `Tightened script for ${activeFormat.label} (${activeFormat.durationBadge}) and switched pace to Brisk.`
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to tighten script.');
    } finally {
      setBusyAssistAction(null);
    }
  }, [
    activeProject.beats,
    callScriptAssistApi,
    activeDialect.label,
    activeFormat.label,
    activeFormat.durationBadge,
    activeFormat.targetSeconds,
    activeStyle.label,
    updateActiveProject,
  ]);

  const handleGenerateHooks = useCallback(async () => {
    setErrorMessage(null);
    setBusyAssistAction('hooks');

    try {
      const fullText = activeProject.beats.map((b) => b.text.trim()).join('\n\n');
      const res = await callScriptAssistApi({
        mode: 'hooks',
        rawScript: fullText,
        dialectLabel: activeDialect.label,
        formatLabel: activeFormat.label,
        styleLabel: activeStyle.label,
      });

      if (!res.hooks || res.hooks.length === 0) {
        throw new Error('No hook variants were returned.');
      }
      setHookVariants(res.hooks);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to generate hooks.');
    } finally {
      setBusyAssistAction(null);
    }
  }, [
    activeProject.beats,
    callScriptAssistApi,
    activeDialect.label,
    activeFormat.label,
    activeStyle.label,
  ]);

  const handleApplyHookVariant = useCallback(
    (hook: HookVariant) => {
      updateActiveProject((proj) => {
        const nextBeats = proj.beats.map((b, idx) =>
          idx === 0
            ? {
                ...b,
                direction: hook.direction,
                text: hook.text,
              }
            : b
        );
        return { ...proj, beats: nextBeats };
      });
      setInfoNotice(`Swapped Beat 1 to "${hook.angle}" hook — click Generate Voice-Over to test.`);
    },
    [updateActiveProject]
  );

  // Beat editing handlers
  const handleUpdateBeat = useCallback(
    (id: string, patch: Partial<ScriptBeat>) => {
      updateActiveProject((proj) => {
        const updated = proj.beats.map((b) => (b.id === id ? { ...b, ...patch } : b));
        if (
          patch.pauseAfterMs !== undefined &&
          updated.every((b) => Boolean(beatAudios[b.id]))
        ) {
          buildMasterFromBeatMap(updated, beatAudios, globalPauseScale, false);
        }
        return { ...proj, beats: updated };
      });
    },
    [updateActiveProject, beatAudios, buildMasterFromBeatMap, globalPauseScale]
  );

  const handleAddBeat = useCallback(() => {
    updateActiveProject((proj) => {
      const nextIndex = proj.beats.length + 1;
      const updatedExisting = proj.beats.map((b, idx) =>
        idx === proj.beats.length - 1 && b.pauseAfterMs === 0
          ? { ...b, pauseAfterMs: 400 }
          : b
      );
      const newBeat: ScriptBeat = {
        id: `beat-${Date.now()}`,
        index: nextIndex,
        actNumber: nextIndex,
        actLabel: `Beat ${nextIndex} · New Beat`,
        title: `Beat ${nextIndex}`,
        direction: 'Clear, natural creator delivery.',
        text: '',
        pauseAfterMs: 0,
      };
      return { ...proj, beats: [...updatedExisting, newBeat] };
    });
  }, [updateActiveProject]);

  const handleDeleteBeat = useCallback(
    (beatId: string) => {
      updateActiveProject((proj) => {
        if (proj.beats.length <= 1) return proj;
        const filtered = proj.beats
          .filter((b) => b.id !== beatId)
          .map((b, idx, arr) => ({
            ...b,
            index: idx + 1,
            actNumber: idx + 1,
            actLabel: `Beat ${idx + 1} · ${b.title}`,
            pauseAfterMs: idx === arr.length - 1 ? 0 : b.pauseAfterMs,
          }));
        return { ...proj, beats: filtered };
      });
    },
    [updateActiveProject]
  );

  // Project management
  const handleSelectProject = useCallback(
    (projectId: string) => {
      stopBeatPreview();
      setActiveProjectId(projectId);
      setBeatAudios({});
      setHookVariants(null);
      setShowPastePanel(false);
    },
    [stopBeatPreview]
  );

  const handleCreateBlankProject = useCallback(() => {
    const newProj: AdProject = {
      id: `proj-${Date.now()}`,
      name: `New E-Com Spot (${projects.length + 1})`,
      formatId: 'tiktok-ugc',
      styleId: 'direct-response',
      dialectId: activeProject.dialectId,
      voiceName: activeProject.voiceName,
      paceId: 'brisk',
      voicePersonaOverride: '',
      beats: [
        {
          id: `beat-${Date.now()}-1`,
          index: 1,
          actNumber: 1,
          actLabel: 'Beat 1 · Hook',
          title: 'Hook',
          direction: 'Fast, curious scroll-stopping hook.',
          text: '',
          pauseAfterMs: 300,
        },
        {
          id: `beat-${Date.now()}-2`,
          index: 2,
          actNumber: 2,
          actLabel: 'Beat 2 · Body & Offer',
          title: 'Body & Offer',
          direction: 'Clear, confident direct-response pitch & CTA.',
          text: '',
          pauseAfterMs: 0,
        },
      ],
      updatedAt: Date.now(),
    };
    setProjects((prev) => [newProj, ...prev]);
    setActiveProjectId(newProj.id);
    setBeatAudios({});
    setShowPastePanel(true);
    setActiveTab('studio');
  }, [projects.length, activeProject.dialectId, activeProject.voiceName]);

  const handleDuplicateProject = useCallback(() => {
    const copy: AdProject = {
      ...cloneProject(activeProject),
      id: `proj-${Date.now()}`,
      name: `${activeProject.name} (Copy)`,
      isBuiltIn: false,
      updatedAt: Date.now(),
    };
    setProjects((prev) => [copy, ...prev]);
    setActiveProjectId(copy.id);
    setBeatAudios({});
    setInfoNotice(`Duplicated project as "${copy.name}" for A/B testing.`);
  }, [activeProject]);

  const handleDeleteProject = useCallback(
    (projectId: string) => {
      const target = projects.find((p) => p.id === projectId);
      if (!target || target.isBuiltIn) return;
      const remaining = projects.filter((p) => p.id !== projectId);
      setProjects(remaining);
      setActiveProjectId(remaining[0]?.id || 'fenoa-mini-vsl');
      setBeatAudios({});
    },
    [projects]
  );

  const handleResetCurrentProject = useCallback(() => {
    if (!builtInSource) return;
    setProjects((prev) =>
      prev.map((p) => (p.id === builtInSource.id ? cloneProject(builtInSource) : p))
    );
    setBeatAudios({});
    setHookVariants(null);
    setInfoNotice(`Restored "${builtInSource.name}" to its original template.`);
  }, [builtInSource]);

  const handleGlobalPauseScaleChange = useCallback(
    (scale: number) => {
      setGlobalPauseScale(scale);
      if (activeProject.beats.every((b) => Boolean(beatAudios[b.id]))) {
        buildMasterFromBeatMap(activeProject.beats, beatAudios, scale, false);
      }
    },
    [activeProject.beats, beatAudios, buildMasterFromBeatMap]
  );

  const handleTogglePlayBeat = useCallback(
    (beatId: string) => {
      const state = beatAudios[beatId];
      if (!state) return;

      if (playingBeatId === beatId) {
        stopBeatPreview();
        return;
      }

      void unlockAudioContext();
      setErrorMessage(null);
      setStopMasterSignal((n) => n + 1);

      try {
        const masteredBeat = applyAudioMastering(state.wavBytes, {
          preset: loudnessPreset,
          gainDb,
          trimSilence: false,
        });

        if (!beatHtmlAudioRef.current) {
          beatHtmlAudioRef.current = new Audio();
        }
        const audio = beatHtmlAudioRef.current;
        audio.pause();
        const prevUrl = beatBlobUrlRef.current;
        beatBlobUrlRef.current = masteredBeat.blobUrl;
        audio.src = masteredBeat.blobUrl;
        audio.volume = 1.0;
        audio.muted = false;
        audio.load();
        if (prevUrl) {
          URL.revokeObjectURL(prevUrl);
        }

        audio.onended = () => setPlayingBeatId(null);
        setPlayingBeatId(beatId);

        audio.play().catch(() => {
          // Automatic fallback to Web Audio PCM player if native <audio> is blocked
          const webPlayer = beatPlayerRef.current;
          if (!webPlayer) {
            setPlayingBeatId(null);
            setErrorMessage('Browser blocked beat playback. Try opening the app in a new tab.');
            return;
          }
          try {
            webPlayer.loadWavBytes(masteredBeat.wavBytes, false);
            webPlayer.play(0).catch((err: unknown) => {
              setPlayingBeatId(null);
              setErrorMessage(
                err instanceof Error
                  ? err.message
                  : 'Browser blocked beat playback. Try opening the app in a new tab.'
              );
            });
          } catch {
            setPlayingBeatId(null);
            setErrorMessage('Unable to play this beat inside the preview frame.');
          }
        });
      } catch (err: unknown) {
        setPlayingBeatId(null);
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to play this beat audio.'
        );
      }
    },
    [beatAudios, playingBeatId, stopBeatPreview, loudnessPreset, gainDb]
  );

  const handleSeekInMaster = useCallback(
    (beatId: string) => {
      const marker = masterMarkers.find((m) => m.beatId === beatId);
      if (!marker) return;
      void unlockAudioContext();
      stopBeatPreview();
      setSeekRequest({ timeSec: marker.startSec, nonce: Date.now() });
    },
    [masterMarkers, stopBeatPreview]
  );

  const handleDownloadMaster = useCallback(() => {
    if (!masterWavBytes) return;
    const slug = activeProject.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 42);
    const filename = `${slug || 'voiceover'}-${activeVoice.name.toLowerCase()}-${loudnessPreset}.wav`;
    triggerWavDownload(masterWavBytes, filename);
  }, [masterWavBytes, activeProject.name, activeVoice.name, loudnessPreset]);

  const handleDownloadBeat = useCallback(
    (beat: ScriptBeat) => {
      const state = beatAudios[beat.id];
      if (!state) return;
      const mastered = applyAudioMastering(state.wavBytes, {
        preset: loudnessPreset,
        gainDb,
        trimSilence,
      });
      URL.revokeObjectURL(mastered.blobUrl);
      const filename = `beat-${String(beat.index).padStart(2, '0')}-${activeVoice.name.toLowerCase()}.wav`;
      triggerWavDownload(mastered.wavBytes, filename);
    },
    [beatAudios, loudnessPreset, gainDb, trimSilence, activeVoice.name]
  );

  const handleLoadTake = useCallback(
    (take: SavedTake) => {
      void unlockAudioContext();
      stopBeatPreview();
      setRawMasterWavBytes(take.rawWavBytes);
      setRawMasterMarkers(take.markers);
      setRawMasterNonce((n) => n + 1);
      setActiveTakeId(take.id);
      setActiveTab('studio');
    },
    [stopBeatPreview]
  );

  const handleDeleteTake = useCallback(
    (takeId: string) => {
      setTakes((prev) => prev.filter((t) => t.id !== takeId));
      if (activeTakeId === takeId) {
        setActiveTakeId(null);
      }
    },
    [activeTakeId]
  );

  const handleCopyScript = useCallback(
    async (mode: 'clean' | 'tagged') => {
      const content =
        mode === 'clean'
          ? activeProject.beats.map((b) => b.text.trim()).join('\n\n')
          : activeProject.beats
              .map(
                (b) =>
                  `[BEAT ${b.index}: ${b.title.toUpperCase()} — Tone: ${b.direction}]\n${b.text.trim()}`
              )
              .join('\n\n');
      try {
        await navigator.clipboard.writeText(content);
        setCopiedMode(mode);
        setTimeout(() => setCopiedMode(null), 2000);
      } catch {
        setErrorMessage('Clipboard copy was blocked by the browser.');
      }
    },
    [activeProject.beats]
  );

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-900 flex flex-col">
      {/* Top Bar: strict 3-zone contract */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200">
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#studio"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('studio');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Sawt Studio
          </a>

          {/* Zone 2: 4 concise single-line text nav links */}
          <nav
            aria-label="Primary studio sections"
            className="flex items-center gap-5 sm:gap-7 text-sm font-medium overflow-x-auto"
          >
            {(
              [
                { id: 'studio', label: 'Studio' },
                { id: 'brief', label: 'Quick Brief' },
                { id: 'takes', label: takes.length > 0 ? `Takes (${takes.length})` : 'Takes' },
                { id: 'pronunciation', label: 'Pronunciation' },
              ] as const
            ).map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
                    active
                      ? 'text-slate-900 border-teal-600'
                      : 'text-slate-500 border-transparent hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="shrink-0 hidden sm:block">
            <button
              type="button"
              onClick={handleGenerateMaster}
              disabled={isGeneratingMaster}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isGeneratingMaster && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isGeneratingMaster ? 'Synthesizing...' : 'Generate Master'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1380px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Info notice banner */}
        {infoNotice && (
          <div
            role="status"
            className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900"
          >
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />
              <p className="text-xs leading-relaxed">{infoNotice}</p>
            </div>
            <button
              type="button"
              onClick={() => setInfoNotice(null)}
              aria-label="Dismiss notice"
              className="text-teal-600 hover:text-teal-900 p-0.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Error Alert Banner */}
        {errorMessage && (
          <div
            role="alert"
            className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <p className="text-xs leading-relaxed">{errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              aria-label="Dismiss error"
              className="text-red-500 hover:text-red-800 p-0.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-6 items-start">
          {/* Left Studio Rail */}
          <SidebarControls
            projects={projects}
            activeProjectId={activeProject.id}
            onSelectProject={handleSelectProject}
            onCreateBlankProject={handleCreateBlankProject}
            onDuplicateProject={handleDuplicateProject}
            onDeleteProject={handleDeleteProject}
            formatId={activeProject.formatId}
            onFormatChange={(formatId) =>
              updateActiveProject((p) => ({ ...p, formatId }))
            }
            styleId={activeProject.styleId}
            onStyleChange={(styleId) =>
              updateActiveProject((p) => ({ ...p, styleId }))
            }
            dialectId={activeProject.dialectId}
            onDialectChange={(dialectId) =>
              updateActiveProject((p) => ({ ...p, dialectId }))
            }
            voiceName={activeProject.voiceName}
            onVoiceChange={(voiceName) =>
              updateActiveProject((p) => ({ ...p, voiceName }))
            }
            paceId={activeProject.paceId}
            onPaceChange={(paceId: PacePreset['id']) =>
              updateActiveProject((p) => ({ ...p, paceId }))
            }
            loudnessPreset={loudnessPreset}
            onLoudnessPresetChange={setLoudnessPreset}
            gainDb={gainDb}
            onGainDbChange={setGainDb}
            trimSilence={trimSilence}
            onTrimSilenceChange={setTrimSilence}
            model={model}
            onModelChange={setModel}
            deliveryMode={deliveryMode}
            onDeliveryModeChange={setDeliveryMode}
            voicePersonaOverride={activeProject.voicePersonaOverride}
            onVoicePersonaOverrideChange={(voicePersonaOverride) =>
              updateActiveProject((p) => ({ ...p, voicePersonaOverride }))
            }
            effectivePersonaPreview={effectivePersona}
            globalPauseScale={globalPauseScale}
            onGlobalPauseScaleChange={handleGlobalPauseScaleChange}
            onResetCurrentProject={handleResetCurrentProject}
            canResetProject={canResetProject}
            canDeleteCurrentProject={!activeProject.isBuiltIn}
            beatCount={activeProject.beats.length}
          />

          {/* Right Main Stage */}
          <div className="min-w-0 space-y-6">
            {activeTab === 'studio' && (
              <>
                <WaveformPlayer
                  projectTitle={activeProject.name}
                  dialectLabel={activeDialect.label}
                  paceLabel={activePace.label}
                  loudnessLabel={activeLoudness.shortLabel}
                  peakDbfs={masterPeakDbfs}
                  rmsDbfs={masterRmsDbfs}
                  wavBytes={masterWavBytes}
                  generationNonce={masterGenNonce}
                  peaks={masterPeaks}
                  durationSec={masterDuration}
                  sampleRate={masterSampleRate}
                  markers={masterMarkers}
                  isGenerating={isGeneratingMaster}
                  generationProgress={generationProgress}
                  activeBeatId={activeBeatId}
                  onActiveBeatChange={setActiveBeatId}
                  onGenerateMaster={handleGenerateMaster}
                  onDownloadMaster={handleDownloadMaster}
                  onWillStartMasterPlay={stopBeatPreview}
                  stopMasterSignal={stopMasterSignal}
                  seekRequest={seekRequest}
                  totalWordCount={totalWordCount}
                  beatCount={activeProject.beats.length}
                  voiceName={activeVoice.name}
                  voiceGender={activeVoice.gender}
                  modelLabel={modelLabel}
                />

                {/* Script Director with Fast E-Com Workflow Toolbar */}
                <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">
                          Script Director
                        </h2>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                          <span className="font-mono tabular-nums">
                            {activeProject.beats.length} beats
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {totalWordCount} words
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums text-slate-700">
                            Est. {formatShortDuration(estimatedDurationSec)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              isOverFormatTarget
                                ? 'text-amber-700 font-medium'
                                : 'text-slate-500'
                            }
                          >
                            {isOverFormatTarget
                              ? `Over ${activeFormat.durationBadge} target`
                              : `Within ${activeFormat.durationBadge} target`}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopyScript('clean')}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {copiedMode === 'clean' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-teal-600" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              Copy Script
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyScript('tagged')}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {copiedMode === 'tagged' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-teal-600" />
                              Copied Cued
                            </>
                          ) : (
                            <span>Copy Cued</span>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Fast E-Com Action Bar */}
                    <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowPastePanel((prev) => !prev)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          showPastePanel
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <ClipboardPaste className="w-3.5 h-3.5" />
                        Paste & Auto-Split
                      </button>

                      <button
                        type="button"
                        onClick={handleTightenToTarget}
                        disabled={busyAssistAction !== null}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {busyAssistAction === 'tighten' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                        ) : (
                          <Scissors className="w-3.5 h-3.5 text-teal-600" />
                        )}
                        Tighten to {activeFormat.durationBadge}
                      </button>

                      <button
                        type="button"
                        onClick={handleGenerateHooks}
                        disabled={busyAssistAction !== null}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {busyAssistAction === 'hooks' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                        )}
                        3 Hook A/B Ideas
                      </button>

                      <button
                        type="button"
                        onClick={handleAddBeat}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer ml-auto"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Beat
                      </button>
                    </div>
                  </div>

                  {/* Inline Paste & Auto-Split Drawer */}
                  {showPastePanel && (
                    <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-900">
                          Paste any raw ad copy to auto-structure & polish for {activeDialect.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowPastePanel(false)}
                          className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          Close
                        </button>
                      </div>
                      <textarea
                        dir={activeDialect.dir}
                        rows={4}
                        value={rawPasteText}
                        onChange={(e) => setRawPasteText(e.target.value)}
                        placeholder="Paste raw script text from WhatsApp, Notion, or Docs..."
                        className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={handlePasteSplit}
                          disabled={busyAssistAction !== null || !rawPasteText.trim()}
                          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          {busyAssistAction === 'split' && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          )}
                          Structure into Beats
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Inline Hook A/B Variations Strip */}
                  {hookVariants && hookVariants.length > 0 && (
                    <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-900">
                          Scroll-Stopping Hook Variations — click any to swap into Beat 1
                        </span>
                        <button
                          type="button"
                          onClick={() => setHookVariants(null)}
                          className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {hookVariants.map((hook, idx) => (
                          <div
                            key={`${hook.angle}-${idx}`}
                            className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col justify-between gap-3"
                          >
                            <div>
                              <div className="text-xs font-semibold text-slate-900">
                                {idx + 1}. {hook.angle}
                              </div>
                              <p
                                dir={activeDialect.dir}
                                lang={activeDialect.langCode}
                                className={`mt-2 text-slate-800 leading-relaxed ${
                                  activeDialect.dir === 'rtl'
                                    ? 'font-arabic text-sm'
                                    : 'text-xs'
                                }`}
                              >
                                {hook.text}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleApplyHookVariant(hook)}
                              className="w-full py-1.5 px-3 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors cursor-pointer"
                            >
                              Use as Beat 1
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Beats List */}
                  <div>
                    {activeProject.beats.map((beat, idx) => (
                      <BeatEditorRow
                        key={beat.id}
                        beat={beat}
                        scriptDir={activeDialect.dir}
                        langCode={activeDialect.langCode}
                        audioState={beatAudios[beat.id]}
                        isGenerating={Boolean(generatingBeatIds[beat.id])}
                        isPlayingBeat={playingBeatId === beat.id}
                        isMasterCurrent={activeBeatId === beat.id}
                        isLast={idx === activeProject.beats.length - 1}
                        canDelete={activeProject.beats.length > 1}
                        onUpdateBeat={handleUpdateBeat}
                        onDeleteBeat={handleDeleteBeat}
                        onSynthesizeBeat={handleSynthesizeSingleBeat}
                        onTogglePlayBeat={handleTogglePlayBeat}
                        onSeekInMaster={
                          masterMarkers.some((m) => m.beatId === beat.id)
                            ? handleSeekInMaster
                            : undefined
                        }
                        onDownloadBeat={handleDownloadBeat}
                      />
                    ))}
                  </div>
                </section>
              </>
            )}

            {activeTab === 'brief' && (
              <QuickBriefGenerator
                defaultFormatId={activeProject.formatId}
                defaultStyleId={activeProject.styleId}
                defaultDialectId={activeProject.dialectId}
                isGenerating={busyAssistAction === 'generate'}
                onGenerateScript={handleQuickBriefGenerate}
              />
            )}

            {activeTab === 'takes' && (
              <TakesArchive
                takes={takes}
                activeTakeId={activeTakeId}
                onLoadTake={handleLoadTake}
                onDownloadTake={(take) =>
                  triggerWavDownload(
                    take.wavBytes,
                    `take-${String(take.takeNumber).padStart(2, '0')}-${take.voiceName.toLowerCase()}.wav`
                  )
                }
                onDeleteTake={handleDeleteTake}
                onGenerateNew={handleGenerateMaster}
              />
            )}

            {activeTab === 'pronunciation' && <PronunciationReference />}
          </div>
        </div>
      </main>

      {/* Quiet minimal footer */}
      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>Sawt Studio · E-Commerce Voice-Over Production</span>
          <span className="font-mono tabular-nums">
            24 kHz 16-bit PCM WAV · Soft-Limited Mastering
          </span>
        </div>
      </footer>
    </div>
  );
}
