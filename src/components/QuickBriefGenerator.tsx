import React, { useState } from 'react';
import { Loader2, Wand2 } from 'lucide-react';
import {
  AD_FORMATS,
  AD_STYLES,
  DIALECT_PRESETS,
} from '../data/scriptData';

export interface QuickBriefPayload {
  productName: string;
  benefit: string;
  offer: string;
  audience: string;
  extraNotes: string;
  formatId: string;
  styleId: string;
  dialectId: string;
  targetSeconds: number;
}

interface QuickBriefGeneratorProps {
  defaultFormatId: string;
  defaultStyleId: string;
  defaultDialectId: string;
  isGenerating: boolean;
  onGenerateScript: (brief: QuickBriefPayload) => void;
}

const SAMPLE_BRIEFS = [
  {
    label: 'Skincare Serum (30s UGC)',
    productName: 'GlowFix Vitamin C Serum',
    benefit: 'Fades post-sun dullness & dark spots in 14 days without irritation',
    offer: '69 TND for 1 bottle, or 115 TND for 2 + free SPF mini, Cash on Delivery',
    audience: 'Tunisian women 25–42 looking for a quick morning glow routine',
    formatId: 'tiktok-ugc',
    styleId: 'ugc-friend',
    dialectId: 'ar-tn',
    targetSeconds: 35,
  },
  {
    label: 'Magnetic Posture Belt (60s PAS)',
    productName: 'AlignPro Back Support',
    benefit: 'Relieves lower back & shoulder tension after long hours at a desk or driving',
    offer: '79 TND with free delivery nationwide & 14-day exchange guarantee',
    audience: 'Office workers and drivers 28–55 with daily back stiffness',
    formatId: 'pas-60',
    styleId: 'direct-response',
    dialectId: 'ar-tn',
    targetSeconds: 60,
  },
  {
    label: 'Oud Extrait Promo (15s Male)',
    productName: 'Velour Oud Extrait de Parfum',
    benefit: '24-hour projection on clothes with warm amber & French woody notes',
    offer: '99 TND + free 15ml travel atomizer for the first 50 orders today',
    audience: 'Men 22–45 looking for a signature evening scent',
    formatId: 'flash-promo',
    styleId: 'urgent-promo',
    dialectId: 'ar-tn',
    targetSeconds: 20,
  },
] as const;

const DURATION_CHOICES = [
  { seconds: 20, label: '15–20s' },
  { seconds: 35, label: '30–40s' },
  { seconds: 60, label: '60s' },
  { seconds: 90, label: '90s' },
  { seconds: 115, label: '< 2:00' },
] as const;

export const QuickBriefGenerator: React.FC<QuickBriefGeneratorProps> = ({
  defaultFormatId,
  defaultStyleId,
  defaultDialectId,
  isGenerating,
  onGenerateScript,
}) => {
  const [productName, setProductName] = useState('');
  const [benefit, setBenefit] = useState('');
  const [offer, setOffer] = useState('');
  const [audience, setAudience] = useState('');
  const [extraNotes, setExtraNotes] = useState('');
  const [formatId, setFormatId] = useState(defaultFormatId);
  const [styleId, setStyleId] = useState(defaultStyleId);
  const [dialectId, setDialectId] = useState(defaultDialectId);
  const [targetSeconds, setTargetSeconds] = useState<number>(
    () => AD_FORMATS.find((f) => f.id === defaultFormatId)?.targetSeconds ?? 35
  );

  const handleApplySample = (sample: (typeof SAMPLE_BRIEFS)[number]) => {
    setProductName(sample.productName);
    setBenefit(sample.benefit);
    setOffer(sample.offer);
    setAudience(sample.audience);
    setFormatId(sample.formatId);
    setStyleId(sample.styleId);
    setDialectId(sample.dialectId);
    setTargetSeconds(sample.targetSeconds);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim() && !benefit.trim()) return;
    onGenerateScript({
      productName: productName.trim(),
      benefit: benefit.trim(),
      offer: offer.trim(),
      audience: audience.trim(),
      extraNotes: extraNotes.trim(),
      formatId,
      styleId,
      dialectId,
      targetSeconds,
    });
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Zero-to-Ad Script Builder
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Drop in a product and offer to generate a phonetically tuned, beat-directed ad script in seconds — ready for 1-click voice synthesis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <span className="text-[11px] text-slate-400 mr-1">Fill sample:</span>
          {SAMPLE_BRIEFS.map((sample) => (
            <button
              key={sample.label}
              type="button"
              onClick={() => handleApplySample(sample)}
              className="px-2.5 py-1 text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {sample.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="brief-product"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Product / Brand Name
            </label>
            <input
              id="brief-product"
              type="text"
              required
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. Fenoa Légèreté Plus, Vitamin C Serum..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
            />
          </div>

          <div>
            <label
              htmlFor="brief-audience"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Target Customer
            </label>
            <input
              id="brief-audience"
              type="text"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="e.g. Women 35+, busy parents, office workers..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="brief-benefit"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Pain Point & Core Benefit
            </label>
            <textarea
              id="brief-benefit"
              rows={3}
              required
              value={benefit}
              onChange={(e) => setBenefit(e.target.value)}
              placeholder="What frustrates the buyer daily and what visible result do they get?"
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15 resize-y"
            />
          </div>

          <div>
            <label
              htmlFor="brief-offer"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Offer, Price, Bonus & Guarantee
            </label>
            <textarea
              id="brief-offer"
              rows={3}
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="e.g. 89 TND for 2 bottles + free massage oil gift, 30-day guarantee, Cash on Delivery"
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15 resize-y"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
          <div>
            <label
              htmlFor="brief-format"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Ad Format
            </label>
            <select
              id="brief-format"
              value={formatId}
              onChange={(e) => {
                const nextId = e.target.value;
                setFormatId(nextId);
                const found = AD_FORMATS.find((f) => f.id === nextId);
                if (found) setTargetSeconds(found.targetSeconds);
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
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
              htmlFor="brief-style"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Vocal Style
            </label>
            <select
              id="brief-style"
              value={styleId}
              onChange={(e) => setStyleId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
            >
              {AD_STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="brief-dialect"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Dialect / Language
            </label>
            <select
              id="brief-dialect"
              value={dialectId}
              onChange={(e) => setDialectId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
            >
              {DIALECT_PRESETS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
          <div>
            <span className="block text-xs font-medium text-slate-700 mb-1.5">
              Target Runtime
            </span>
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {DURATION_CHOICES.map((d) => (
                <button
                  key={d.seconds}
                  type="button"
                  onClick={() => setTargetSeconds(d.seconds)}
                  className={`px-3 py-1.5 text-xs font-mono tabular-nums rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    targetSeconds === d.seconds
                      ? 'bg-white text-slate-900 font-medium shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isGenerating || (!productName.trim() && !benefit.trim())}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Building Beats...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                Generate Ready-to-Voice Script
              </>
            )}
          </button>
        </div>

        <div>
          <label
            htmlFor="brief-notes"
            className="block text-xs font-medium text-slate-700 mb-1.5"
          >
            Optional Angle or Must-Include Phrase
          </label>
          <input
            id="brief-notes"
            type="text"
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value)}
            placeholder="e.g. Mention 100% natural ingredients, avoid medical claims, emphasize fast delivery..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
          />
        </div>
      </form>
    </section>
  );
};
