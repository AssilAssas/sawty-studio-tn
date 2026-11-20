import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_TTS_MODEL = 'gemini-3.8-flash-lite-tts';
const ALT_TTS_MODEL = 'gemini-3.8-flash-tts';
const SCRIPT_ASSIST_MODEL = 'gemini-4-hydrogen';
const SCRIPT_ASSIST_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

const ALLOWED_MODELS = new Set([
  'gemini-3.8-flash-lite-tts',
  'gemini-3.8-flash-tts',
]);

const ALLOWED_VOICES = new Set(['Kore', 'Zephyr', 'Charon', 'Puck', 'Fenrir']);

interface SynthesisSegment {
  text: string;
  style: string;
}

function createAiClient(apiVersion = 'v1beta'): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatus(err: unknown): number {
  if (typeof err === 'object' && err !== null) {
    const rec = err as Record<string, unknown>;
    if (typeof rec.status === 'number') return rec.status;
    if (typeof rec.code === 'number') return rec.code;
  }
  return 500;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function isDailyQuotaExhausted(status: number, message: string): boolean {
  if (status !== 429) return false;
  return (
    message.includes('GenerateRequestsPerDay') ||
    message.includes('per day limit exceeded') ||
    message.includes('RESOURCE_EXHAUSTED')
  );
}

function safeParseModelJson<T>(rawText: string | undefined): T {
  const cleaned = (rawText ?? '{}')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned || '{}') as T;
}

async function callGeminiTts(params: {
  segments: SynthesisSegment[];
  voiceName: string;
  model: string;
}): Promise<{ audioBase64: string; mimeType: string }> {
  const ai = createAiClient('v1beta');
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: params.model,
        contents: [
          {
            role: 'user',
            parts: params.segments.map((seg) => ({
              text: seg.text,
              speechMetadata: {
                style: seg.style,
              },
            })),
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: params.voiceName },
            },
          },
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData?.data
      );
      const audioBase64 = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType || 'audio/wav';

      if (!audioBase64) {
        throw new Error('Gemini TTS returned no audio data for this segment.');
      }

      return { audioBase64, mimeType };
    } catch (err: unknown) {
      const status = getErrorStatus(err);
      const message = getErrorMessage(err);

      if (isDailyQuotaExhausted(status, message)) {
        throw err;
      }

      const isTransient = status >= 500 || status === 503;
      if (attempt < maxAttempts && isTransient) {
        await sleep(700 * attempt);
        continue;
      }
      throw err;
    }
  }

  throw new Error('Synthesis failed after retry attempts.');
}

async function synthesizeWithFallback(params: {
  segments: SynthesisSegment[];
  voiceName: string;
  model: string;
}): Promise<{
  audioBase64: string;
  mimeType: string;
  model: string;
  fallbackFrom?: string;
}> {
  try {
    const result = await callGeminiTts(params);
    return {
      ...result,
      model: params.model,
    };
  } catch (err: unknown) {
    const status = getErrorStatus(err);
    const message = getErrorMessage(err);
    const alternateModel =
      params.model === DEFAULT_TTS_MODEL ? ALT_TTS_MODEL : DEFAULT_TTS_MODEL;

    if (isDailyQuotaExhausted(status, message)) {
      console.warn(
        `[TTS Fallback] ${params.model} hit daily quota; falling back to ${alternateModel}.`
      );
      const fallbackResult = await callGeminiTts({
        segments: params.segments,
        voiceName: params.voiceName,
        model: alternateModel,
      });
      return {
        ...fallbackResult,
        model: alternateModel,
        fallbackFrom: params.model,
      };
    }

    throw err;
  }
}

async function generateScriptWithFallback(params: {
  contents: string;
  systemInstruction: string;
  responseSchema: Record<string, unknown>;
}): Promise<string | undefined> {
  const ai = createAiClient();
  const modelsToTry = [
    { model: SCRIPT_ASSIST_MODEL, useThinking: true, timeoutMs: 12000 },
    { model: SCRIPT_ASSIST_FALLBACK_MODEL, useThinking: false, timeoutMs: 20000 },
  ];
  let lastErr: unknown;

  for (const candidate of modelsToTry) {
    const maxAttempts = candidate.model === SCRIPT_ASSIST_FALLBACK_MODEL ? 2 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: candidate.model,
          contents: params.contents,
          config: {
            systemInstruction: params.systemInstruction,
            ...(candidate.useThinking
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
            responseMimeType: 'application/json',
            responseSchema: params.responseSchema,
            abortSignal: AbortSignal.timeout(candidate.timeoutMs),
          },
        });
        return response.text;
      } catch (err: unknown) {
        lastErr = err;
        const status = getErrorStatus(err);
        const message = getErrorMessage(err);
        const isTimeout =
          err instanceof Error &&
          (err.name === 'TimeoutError' ||
            err.name === 'AbortError' ||
            message.toLowerCase().includes('timeout') ||
            message.toLowerCase().includes('aborted'));
        const isTransient = isTimeout || status >= 500 || status === 503 || status === 429;

        if (attempt < maxAttempts && (status >= 500 || status === 503)) {
          await sleep(800 * attempt);
          continue;
        }

        if (candidate.model !== SCRIPT_ASSIST_FALLBACK_MODEL && isTransient) {
          console.warn(
            `[Script Assist Fallback] ${candidate.model} failed (${isTimeout ? 'timeout' : status}: ${message.slice(0, 120)}); falling back to ${SCRIPT_ASSIST_FALLBACK_MODEL}.`
          );
          break;
        }
        throw err;
      }
    }
  }

  throw lastErr ?? new Error('Unable to process script right now.');
}

const TUNISIAN_PHONETICS_RULE = `
When writing in Tunisian Derja (ar-TN):
- Use authentic, natural everyday Tunis/coastal Tunisian Derja — NEVER Modern Standard Arabic (Fusha).
- Use ڨ strictly for hard-G Tunisian words (e.g. الڨنّارية) while preserving coastal Qaf (ق) on words like فوق, تفيق, تقوم, قعدة.
- Spell embedded French loanwords naturally using پ (for p) and light diacritics so TTS reads them seamlessly (e.g. دْرِيناجْ, پُوندُونْ, فْلاكُونْ, بُوتُونْ, الرُوتِينْ, غارُونْتِي, تْكُومُونْدِي, كادُو).
- Add helpful vowel marks (harakat) on purely Tunisian verbs or imperatives that TTS might misread as Fusha (e.g. المَيْدَة, يِتْسَلَّعْلِكْ, إِخْلِصْ).
- Use punctuation intentionally: keep ellipses (…) only for deliberate dramatic beats, and use commas (،) for brisk flow.
`;

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '4mb' }));

  // Lightweight in-memory LRU WAV cache so <audio> streams real same-origin HTTPS audio with byte-range seeking
  const MAX_CACHED_CLIPS = 24;
  const audioCache = new Map<string, Buffer>();

  const storeCachedAudio = (buffer: Buffer): string => {
    const id = crypto.randomBytes(10).toString('hex');
    audioCache.set(id, buffer);
    if (audioCache.size > MAX_CACHED_CLIPS) {
      const oldestKey = audioCache.keys().next().value;
      if (oldestKey) audioCache.delete(oldestKey);
    }
    return id;
  };

  app.post(
    '/api/audio/cache',
    express.raw({ type: ['audio/wav', 'application/octet-stream'], limit: '30mb' }),
    (req: Request, res: Response) => {
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || buf.length <= 44) {
        res.status(400).json({ error: 'Valid WAV audio payload is required.' });
        return;
      }
      const id = storeCachedAudio(buf);
      res.json({ id, url: `/api/audio/${id}.wav` });
    }
  );

  app.get('/api/audio/:id.wav', (req: Request, res: Response) => {
    const id = String(req.params.id || '').replace(/[^a-f0-9]/gi, '');
    const buf = audioCache.get(id);
    if (!buf) {
      res.status(404).send('Audio clip expired or not found.');
      return;
    }

    const total = buf.length;
    const rangeHeader = req.headers.range;

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');

    if (rangeHeader && rangeHeader.startsWith('bytes=')) {
      const parts = rangeHeader.replace(/^bytes=/, '').split('-');
      const rawStart = parts[0]?.trim() ?? '';
      const rawEnd = parts[1]?.trim() ?? '';

      let start = 0;
      let end = total - 1;

      if (rawStart === '' && rawEnd !== '') {
        // Suffix byte range: bytes=-500
        const suffixLen = Number.parseInt(rawEnd, 10);
        if (!Number.isFinite(suffixLen) || suffixLen <= 0) {
          res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
          return;
        }
        start = Math.max(0, total - suffixLen);
      } else {
        const parsedStart = Number.parseInt(rawStart, 10);
        const parsedEnd = rawEnd === '' ? total - 1 : Number.parseInt(rawEnd, 10);
        if (!Number.isFinite(parsedStart) || !Number.isFinite(parsedEnd)) {
          res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
          return;
        }
        start = Math.max(0, parsedStart);
        end = Math.min(total - 1, parsedEnd);
      }

      if (start >= total || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
        return;
      }

      const chunk = buf.subarray(start, end + 1);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', String(chunk.length));
      res.end(chunk);
      return;
    }

    res.setHeader('Content-Length', String(total));
    res.status(200).end(buf);
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post('/api/tts/synthesize', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        text?: unknown;
        style?: unknown;
        segments?: unknown;
        voiceName?: unknown;
        model?: unknown;
      };

      const defaultStyle =
        'Warm, relatable, trustworthy Tunisian woman in her late 30s speaking authentic everyday Tunisian Arabic dialect (Tunisian Derja).';

      let segments: SynthesisSegment[] = [];

      if (Array.isArray(body.segments) && body.segments.length > 0) {
        segments = body.segments
          .filter(
            (item): item is { text: string; style?: string } =>
              typeof item === 'object' &&
              item !== null &&
              typeof (item as { text?: unknown }).text === 'string' &&
              (item as { text: string }).text.trim().length > 0
          )
          .map((item) => ({
            text: item.text.trim(),
            style:
              typeof item.style === 'string' && item.style.trim().length > 0
                ? item.style.trim()
                : defaultStyle,
          }));
      } else if (typeof body.text === 'string' && body.text.trim().length > 0) {
        segments = [
          {
            text: body.text.trim(),
            style:
              typeof body.style === 'string' && body.style.trim().length > 0
                ? body.style.trim()
                : defaultStyle,
          },
        ];
      }

      if (segments.length === 0) {
        res.status(400).json({ error: 'Script text is required for synthesis.' });
        return;
      }

      const requestedVoice =
        typeof body.voiceName === 'string' ? body.voiceName.trim() : 'Kore';
      const requestedModel =
        typeof body.model === 'string' ? body.model.trim() : DEFAULT_TTS_MODEL;

      const voiceName = ALLOWED_VOICES.has(requestedVoice)
        ? requestedVoice
        : 'Kore';
      const model = ALLOWED_MODELS.has(requestedModel)
        ? requestedModel
        : DEFAULT_TTS_MODEL;

      const result = await synthesizeWithFallback({
        segments,
        voiceName,
        model,
      });

      const audioId = storeCachedAudio(Buffer.from(result.audioBase64, 'base64'));

      res.json({
        audioBase64: result.audioBase64,
        audioUrl: `/api/audio/${audioId}.wav`,
        mimeType: result.mimeType,
        voiceName,
        model: result.model,
        fallbackFrom: result.fallbackFrom,
      });
    } catch (err: unknown) {
      const status = getErrorStatus(err);
      const message = getErrorMessage(err);
      console.error('[TTS Synthesis Error]', status, message.slice(0, 300));

      if (
        status === 403 ||
        message.includes('API_KEY_INVALID') ||
        message.includes('GEMINI_API_KEY')
      ) {
        res.status(403).json({
          error:
            'API key authentication failed. Please check your Gemini API key in Settings > Secrets.',
        });
        return;
      }

      if (status === 429 || message.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error:
            'Daily free-tier TTS quota has been reached on this API key. Use 1-Request Master to minimize calls, or attach a billing-enabled Gemini API key in Settings > Secrets for higher quota.',
        });
        return;
      }

      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: 'Unable to synthesize speech right now. Please try again in a moment.',
      });
    }
  });

  app.post('/api/script/assist', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        mode?: unknown;
        dialectLabel?: unknown;
        formatLabel?: unknown;
        styleLabel?: unknown;
        targetSeconds?: unknown;
        rawScript?: unknown;
        beats?: unknown;
        brief?: {
          productName?: string;
          benefit?: string;
          offer?: string;
          audience?: string;
          extraNotes?: string;
        };
      };

      const mode = typeof body.mode === 'string' ? body.mode : '';
      const dialectLabel =
        typeof body.dialectLabel === 'string'
          ? body.dialectLabel
          : 'Tunisian Derja';
      const formatLabel =
        typeof body.formatLabel === 'string'
          ? body.formatLabel
          : 'Mini-VSL';
      const styleLabel =
        typeof body.styleLabel === 'string'
          ? body.styleLabel
          : 'Conversational UGC Friend';
      const targetSeconds =
        typeof body.targetSeconds === 'number' && body.targetSeconds > 0
          ? Math.min(240, Math.max(10, Math.round(body.targetSeconds)))
          : 60;

      const targetWords = Math.max(25, Math.round((targetSeconds / 60) * 145));

      if (mode === 'hooks') {
        const currentScript =
          typeof body.rawScript === 'string' ? body.rawScript.trim() : '';
        if (!currentScript) {
          res.status(400).json({ error: 'Current script is required to generate hook variants.' });
          return;
        }

        const rawJsonText = await generateScriptWithFallback({
          contents: `Create 3 distinct, scroll-stopping opening hooks (first 3-5 seconds, ~14-24 words each) for this e-commerce ad script.
Target language/dialect: ${dialectLabel}
Ad format: ${formatLabel}
Vocal style: ${styleLabel}

Current script for context:
${currentScript}

Provide 3 clearly different angles (e.g., Curiosity Question, Pain-Point Callout, Bold Pattern-Interrupt).`,
          systemInstruction: `You are a senior e-commerce direct-response copywriter and voice director. Write high-converting, spoken-word ad hooks that sound natural aloud.${TUNISIAN_PHONETICS_RULE}`,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hooks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    angle: { type: Type.STRING, description: 'Short hook angle label (2-4 words)' },
                    direction: { type: Type.STRING, description: 'Concise vocal direction cue in English' },
                    text: { type: Type.STRING, description: 'Spoken hook text in the target dialect, ready for TTS' },
                  },
                  required: ['angle', 'direction', 'text'],
                },
              },
            },
            required: ['hooks'],
          },
        });

        const parsed = safeParseModelJson<{
          hooks?: Array<{ angle: string; direction: string; text: string }>;
        }>(rawJsonText);
        res.json({ hooks: parsed.hooks ?? [] });
        return;
      }

      if (mode === 'generate' || mode === 'split' || mode === 'tighten') {
        let prompt = '';
        if (mode === 'generate') {
          const b = body.brief ?? {};
          if (!b.productName?.trim() && !b.benefit?.trim()) {
            res.status(400).json({
              error: 'Please enter at least a product name or core benefit.',
            });
            return;
          }
          prompt = `Write a complete, ready-to-voice e-commerce ad script structured into emotional beats.
- Product: ${b.productName || 'E-commerce product'}
- Core benefit / pain solved: ${b.benefit || 'Fast daily relief and convenience'}
- Offer / Price / CTA: ${b.offer || 'Special bundle offer with Cash on Delivery'}
- Target audience: ${b.audience || 'Everyday social media shoppers'}
- Extra notes: ${b.extraNotes || 'None'}
- Language / Dialect: ${dialectLabel}
- Ad format: ${formatLabel}
- Vocal style: ${styleLabel}
- Target runtime: ~${targetSeconds} seconds (aim for roughly ${targetWords} words total).
Break into ${targetSeconds <= 25 ? '3' : targetSeconds <= 50 ? '4' : targetSeconds <= 85 ? '5' : '6-7'} crisp beats with specific vocal direction cues in English and spoken script text ONLY (no stage directions inside the spoken text).`;
        } else if (mode === 'split') {
          const rawScript =
            typeof body.rawScript === 'string' ? body.rawScript.trim() : '';
          if (!rawScript) {
            res.status(400).json({ error: 'Please paste a raw script to structure.' });
            return;
          }
          prompt = `Take this raw e-commerce ad script, preserve its core meaning and product/offer details, apply authentic spoken phonetics for ${dialectLabel}, and split it into clean emotional beats for voice-over recording.
- Ad format: ${formatLabel}
- Vocal style: ${styleLabel}
- Target language/dialect: ${dialectLabel}

Raw script:
${rawScript}`;
        } else {
          const currentScript =
            typeof body.rawScript === 'string' ? body.rawScript.trim() : '';
          if (!currentScript) {
            res.status(400).json({ error: 'Script text is required to tighten.' });
            return;
          }
          prompt = `Tighten and optimize this e-commerce ad script so it reads cleanly in UNDER ${targetSeconds} seconds (aim for ~${targetWords} words total at a brisk creator pace).
- Keep the exact product name, key mechanism, emotional payoff, price/offer, guarantee, and CTA intact.
- Replace unnecessary ellipses (…) with crisp commas so TTS does not stall on long pauses.
- Preserve authentic ${dialectLabel} vocabulary and phonetic spellings.
- Vocal style: ${styleLabel}
- Format: ${formatLabel}

Current script:
${currentScript}`;
        }

        const rawJsonText = await generateScriptWithFallback({
          contents: prompt,
          systemInstruction: `You are an elite e-commerce direct-response scriptwriter and voice-over director. Return clean JSON beats ready for immediate Text-to-Speech synthesis. Never include bracketed tags or speaker labels inside each beat's "text" field — put delivery instructions exclusively in "direction".${TUNISIAN_PHONETICS_RULE}`,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              projectTitle: {
                type: Type.STRING,
                description: 'Concise campaign title (3-6 words)',
              },
              beats: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING, description: 'Short beat title (e.g. The Hook, Offer & CTA)' },
                    direction: { type: Type.STRING, description: 'Actionable vocal tone, energy, and pacing cue in English' },
                    text: { type: Type.STRING, description: 'Exact spoken copy for TTS with no bracket tags' },
                    pauseAfterMs: { type: Type.INTEGER, description: 'Natural pause after this beat in ms (0 to 650, 0 on final beat)' },
                  },
                  required: ['title', 'direction', 'text', 'pauseAfterMs'],
                },
              },
            },
            required: ['projectTitle', 'beats'],
          },
        });

        const parsed = safeParseModelJson<{
          projectTitle?: string;
          beats?: Array<{
            title: string;
            direction: string;
            text: string;
            pauseAfterMs?: number;
          }>;
        }>(rawJsonText);

        res.json({
          projectTitle: parsed.projectTitle || 'Untitled Ad Spot',
          beats: parsed.beats ?? [],
        });
        return;
      }

      res.status(400).json({ error: 'Unsupported script assist mode.' });
    } catch (err: unknown) {
      const status = getErrorStatus(err);
      const message = getErrorMessage(err);
      console.error('[Script Assist Error]', status, message.slice(0, 300));

      if (status === 429 || message.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error:
            'Script assistant rate limit reached. Wait a moment and retry, or check Settings > Secrets for a billing-enabled API key.',
        });
        return;
      }

      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: 'Unable to process script right now. Please try again.',
      });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(__dirname, 'dist');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Sawt Studio server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
