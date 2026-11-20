export interface ScriptBeat {
  id: string;
  index: number;
  actNumber: number;
  actLabel: string;
  title: string;
  direction: string;
  text: string;
  pauseAfterMs: number;
}

export type VoiceGender = 'female' | 'male';

export interface VoiceOption {
  id: string;
  name: string;
  gender: VoiceGender;
  character: string;
  bestFor: string;
  recommended?: boolean;
}

export type PronunciationCategory = 'tunisian' | 'french';

export interface PronunciationEntry {
  arabic: string;
  phonetic: string;
  origin: string;
  category: PronunciationCategory;
  tip: string;
}

export interface AdFormatPreset {
  id: string;
  label: string;
  targetSeconds: number;
  durationBadge: string;
  description: string;
  pacingHint: string;
}

export interface AdStylePreset {
  id: string;
  label: string;
  summary: string;
  styleDirective: string;
}

export interface DialectPreset {
  id: string;
  label: string;
  langCode: string;
  dir: 'rtl' | 'ltr';
  accentDirective: string;
}

export interface PacePreset {
  id: 'relaxed' | 'natural' | 'brisk' | 'fast';
  label: string;
  wpm: number;
  directive: string;
}

export type LoudnessPresetId = 'social-loud' | 'broadcast' | 'raw';

export interface LoudnessPreset {
  id: LoudnessPresetId;
  label: string;
  shortLabel: string;
  description: string;
}

export interface AdProject {
  id: string;
  name: string;
  formatId: string;
  styleId: string;
  dialectId: string;
  voiceName: string;
  paceId: PacePreset['id'];
  voicePersonaOverride: string;
  beats: ScriptBeat[];
  updatedAt: number;
  isBuiltIn?: boolean;
}

export const VOICE_OPTIONS: VoiceOption[] = [
  {
    id: 'Kore',
    name: 'Kore',
    gender: 'female',
    character: 'Warm, grounded & trustworthy',
    bestFor: 'Late-30s wellness, skincare, Mini-VSL storytelling',
    recommended: true,
  },
  {
    id: 'Zephyr',
    name: 'Zephyr',
    gender: 'female',
    character: 'Bright, airy & friendly',
    bestFor: '20s–30s TikTok UGC, beauty demos, lifestyle hooks',
  },
  {
    id: 'Puck',
    name: 'Puck',
    gender: 'male',
    character: 'Lively, sharp & energetic',
    bestFor: 'Fast Reels, gadget demos, direct-response offers',
  },
  {
    id: 'Charon',
    name: 'Charon',
    gender: 'male',
    character: 'Calm, credible & measured',
    bestFor: 'Founder story, expert explainer, clinical trust',
  },
  {
    id: 'Fenrir',
    name: 'Fenrir',
    gender: 'male',
    character: 'Deep, bold & commanding',
    bestFor: 'High-impact flash promos, luxury fragrance, autos',
  },
];

export const MODEL_OPTIONS = [
  {
    id: 'gemini-3.8-flash-lite-tts',
    label: 'Flash Lite TTS',
    detail: 'Recommended default — fast synthesis with higher daily free-tier quota',
    recommended: true,
  },
  {
    id: 'gemini-3.8-flash-tts',
    label: 'Flash TTS',
    detail: 'Expressive Voice Design (10 req/day on free tier; auto-falls back to Lite)',
    recommended: false,
  },
] as const;

export type TtsModelId = (typeof MODEL_OPTIONS)[number]['id'];

export const AD_FORMATS: AdFormatPreset[] = [
  {
    id: 'mini-vsl',
    label: 'Mini-VSL',
    targetSeconds: 115,
    durationBadge: '< 2:00',
    description: 'Story-driven 5–7 beat conversion ad with proof & guarantee',
    pacingHint: 'Shift gears cleanly across beats like a real creator speaking to camera.',
  },
  {
    id: 'tiktok-ugc',
    label: 'TikTok / Reels UGC',
    targetSeconds: 35,
    durationBadge: '30–40s',
    description: 'Scroll-stopping hook, quick pain-point, rapid demo & CTA',
    pacingHint: 'Zero wasted air — punchy scroll-stopping opener and brisk social cadence.',
  },
  {
    id: 'pas-60',
    label: 'Direct Response PAS',
    targetSeconds: 60,
    durationBadge: '60s',
    description: 'Problem → Agitate → Solution → Risk-reversal offer',
    pacingHint: 'Clear emotional contrast between daily frustration and effortless relief.',
  },
  {
    id: 'flash-promo',
    label: 'Flash Sale / Offer',
    targetSeconds: 20,
    durationBadge: '15–20s',
    description: 'Short retargeting promo, bundle drop, or limited-time discount',
    pacingHint: 'Upbeat, crisp, zero hesitation — land the offer and CTA immediately.',
  },
  {
    id: 'testimonial',
    label: 'Customer Story',
    targetSeconds: 45,
    durationBadge: '45s',
    description: 'Authentic first-person review & before/after discovery',
    pacingHint: 'Intimate, unscripted friend-to-friend tone as if sharing a voice note.',
  },
];

export const AD_STYLES: AdStylePreset[] = [
  {
    id: 'ugc-friend',
    label: 'Conversational UGC Friend',
    summary: 'Relatable, warm, genuine discovery — never shouty',
    styleDirective:
      'Conversational, empathetic, and natural like a close friend talking to camera sharing a genuine discovery — never a stiff TV commercial announcer.',
  },
  {
    id: 'direct-response',
    label: 'High-Energy Direct Response',
    summary: 'Punchy, scroll-stopping, crisp persuasion & strong CTA',
    styleDirective:
      'Crisp, confident, high-retention direct-response creator delivery with sharp hook energy, clear emphasis on benefits, and decisive CTA.',
  },
  {
    id: 'calm-expert',
    label: 'Calm Wellness / Expert',
    summary: 'Reassuring, grounded credibility & soothing clarity',
    styleDirective:
      'Calm, authoritative yet approachable expert tone — reassuring, articulate, unhurried confidence that builds immediate trust.',
  },
  {
    id: 'luxury-editorial',
    label: 'Luxury / Editorial',
    summary: 'Refined, poised, understated prestige',
    styleDirective:
      'Poised, refined editorial voice with understated warmth, clean articulation, and premium restraint.',
  },
  {
    id: 'urgent-promo',
    label: 'Upbeat Flash Offer',
    summary: 'Fast, bright, clear urgency for retargeting & promos',
    styleDirective:
      'Upbeat, energetic, crystal-clear promotional delivery with lively tempo and clear emphasis on price, bonus gift, and deadline.',
  },
];

export const DIALECT_PRESETS: DialectPreset[] = [
  {
    id: 'ar-tn',
    label: 'Tunisian Derja',
    langCode: 'ar-TN',
    dir: 'rtl',
    accentDirective:
      'Authentic everyday Tunisian Arabic dialect (Tunis / coastal Derja) — never Modern Standard Arabic (Fusha). Keep coastal Tunis Qaf on words like فوق, تفيق, تقوم, قعدة, while pronouncing ڨ with a hard G (e.g. الڨنّارية = el-guenariya). Pronounce المَيْدَة (el-meyda), يِتْسَلَّعْلِكْ (yitsalla\'lik), السّْكَنْجْبِيرْ (es-skanjbir), and إِخْلِصْ (ikhlis) strictly in Tunisian Derja, and blend French loanwords effortlessly as Tunisians speak daily.',
  },
  {
    id: 'ar-ma',
    label: 'Moroccan Darija',
    langCode: 'ar-MA',
    dir: 'rtl',
    accentDirective:
      'Authentic everyday Moroccan Darija (Casablanca / Rabat natural urban accent) — never Modern Standard Arabic. Blend French terms naturally as spoken in daily Moroccan conversation.',
  },
  {
    id: 'ar-dz',
    label: 'Algerian Darja',
    langCode: 'ar-DZ',
    dir: 'rtl',
    accentDirective:
      'Authentic everyday Algerian Darja (Algiers natural urban cadence) — never Modern Standard Arabic. Blend French loanwords seamlessly.',
  },
  {
    id: 'ar-gulf',
    label: 'Gulf / Khaleeji Arabic',
    langCode: 'ar-SA',
    dir: 'rtl',
    accentDirective:
      'Authentic, natural modern Gulf / Khaleeji Arabic (Saudi / Emirati conversational tone) — warm, modern, and colloquial rather than stiff classical news Arabic.',
  },
  {
    id: 'ar-levant',
    label: 'Levantine Arabic',
    langCode: 'ar-LB',
    dir: 'rtl',
    accentDirective:
      'Authentic, natural urban Levantine Arabic — smooth, friendly everyday pronunciation.',
  },
  {
    id: 'ar-eg',
    label: 'Egyptian Arabic',
    langCode: 'ar-EG',
    dir: 'rtl',
    accentDirective:
      'Authentic everyday Cairo Egyptian Arabic — warm, expressive, natural conversational rhythm with soft hard-G pronunciation for ج.',
  },
  {
    id: 'fr',
    label: 'French (Natural)',
    langCode: 'fr-FR',
    dir: 'ltr',
    accentDirective:
      'Natural contemporary French creator delivery — clear, warm, conversational without theatrical radio announcer clichés.',
  },
  {
    id: 'en',
    label: 'English (Conversational)',
    langCode: 'en-US',
    dir: 'ltr',
    accentDirective:
      'Natural, authentic conversational English UGC creator delivery — warm, clear, engaging.',
  },
];

export const PACE_PRESETS: PacePreset[] = [
  {
    id: 'relaxed',
    label: 'Relaxed',
    wpm: 125,
    directive: 'Unhurried, relaxed storytelling pace (~125 words/minute) with full, lingering breaths.',
  },
  {
    id: 'natural',
    label: 'Natural',
    wpm: 142,
    directive: 'Natural conversational pace (~142 words/minute) with crisp, comfortable breathing.',
  },
  {
    id: 'brisk',
    label: 'Brisk',
    wpm: 162,
    directive: 'Brisk, high-retention social video creator pace (~162 words/minute) with tight pauses and strong forward momentum.',
  },
  {
    id: 'fast',
    label: 'Fast Reel',
    wpm: 182,
    directive: 'Fast, punchy TikTok/Reels pace (~182 words/minute) with minimal dead air and snappy transitions.',
  },
];

export const LOUDNESS_PRESETS: LoudnessPreset[] = [
  {
    id: 'social-loud',
    label: 'Social Feed Loud',
    shortLabel: 'Social Loud',
    description: 'Normalized & soft-limited (-1 dBFS) for Meta, TikTok & mobile speakers',
  },
  {
    id: 'broadcast',
    label: 'Broadcast Warm',
    shortLabel: 'Broadcast',
    description: 'Balanced studio loudness for YouTube, VSL landing pages & podcasts',
  },
  {
    id: 'raw',
    label: 'Raw Studio',
    shortLabel: 'Original',
    description: 'Untouched 24 kHz TTS output with manual gain only',
  },
];

export const DEFAULT_VOICE_PERSONA = `Warm, relatable, trustworthy Tunisian woman in her late 30s speaking authentic everyday Tunisian Arabic dialect (Tunis / coastal Derja) like a real creator talking to camera in a Mini-VSL — never Modern Standard Arabic (Fusha) and never a loud TV announcer. Keep natural Tunis/coastal Qaf on words like فوق, تفيق, تقوم, قعدة, while pronouncing الڨنّارية with a hard G ("el-guenariya"). Pronounce المَيْدَة ("el-meyda"), يِتْسَلَّعْلِكْ ("yitsalla'lik"), السّْكَنْجْبِيرْ ("es-skanjbir"), and إِخْلِصْ ("ikhlis") strictly in authentic Tunisian Derja. Blend embedded French loanwords effortlessly as Tunisians speak daily (drainage, pendant, dose, extraits, orthosiphon, pissenlit, naturellement, bouton, routine, juste, flacon, Légèreté Plus, tcommandi, huile de menthe poivrée, cadeau, garantie). Respect every ellipsis (…), em-dash (—), and comma for natural breath and storytelling pacing. Read ONLY the Arabic script verbatim without speaking any tags or adding extra words.`;

export function buildEffectivePersona(params: {
  voiceName: string;
  dialectId: string;
  styleId: string;
  formatId: string;
  paceId: PacePreset['id'];
  customPersonaOverride?: string;
}): string {
  const voice = VOICE_OPTIONS.find((v) => v.id === params.voiceName) ?? VOICE_OPTIONS[0];
  const dialect =
    DIALECT_PRESETS.find((d) => d.id === params.dialectId) ?? DIALECT_PRESETS[0];
  const style = AD_STYLES.find((s) => s.id === params.styleId) ?? AD_STYLES[0];
  const format = AD_FORMATS.find((f) => f.id === params.formatId) ?? AD_FORMATS[0];
  const pace = PACE_PRESETS.find((p) => p.id === params.paceId) ?? PACE_PRESETS[1];

  const genderLabel =
    voice.gender === 'female' ? 'Warm, relatable woman' : 'Credible, engaging man';

  const baseOverride = params.customPersonaOverride?.trim();
  if (baseOverride) {
    return `${baseOverride}\n\nActive Pace: ${pace.directive}\nFormat Cadence: ${format.pacingHint}`;
  }

  return `${genderLabel} (${voice.character}) performing a ${format.label} ad. Accent & Dialect: ${dialect.accentDirective} Vocal Style: ${style.styleDirective} Pacing: ${pace.directive} ${format.pacingHint} Read ONLY the script verbatim without adding extra words or reading formatting tags.`;
}

export const INITIAL_SCRIPT_BEATS: ScriptBeat[] = [
  {
    id: 'beat-1',
    index: 1,
    actNumber: 1,
    actLabel: 'Beat 1 · The Hook',
    title: 'The Hook',
    direction:
      'Curious, conversational, slightly leaned-in, medium-fast pace to stop the scroll. Respect both ellipses (…) for subtle intrigue before landing the closing question.',
    text: `كان مرا فوق الخمسة وتلاثين… تاخو قطرات نباتية للدْرِيناجْ وراحة الهضم، كل نهار، پُوندُونْ تلاثين يوم… شنوّة تنجّم تلاحظ في بدنها؟`,
    pauseAfterMs: 450,
  },
  {
    id: 'beat-2',
    index: 2,
    actNumber: 2,
    actLabel: 'Beat 2 · The Mechanism',
    title: 'The Mechanism',
    direction:
      'Clear, informative, reassuring expert. Pronounce الڨنّارية with a hard G ("el-guenariya"), السّْكَنْجْبِيرْ naturally in Tunisian Derja, and blend French botanical terms (dose, extraits, orthosiphon, pissenlit, naturellement) seamlessly.',
    text: `في دُوزْ وحدة، فمّا خمسة إيكْسْتْرِي متاع نباتات يخدمو مع بعضهم. البسباس، السّْكَنْجْبِيرْ والڨنّارية يعاونو على راحة الهضم. والأُورْتُوسِيفُونْ والپِيسُونْلِي يعاونو بدنك باش يتخلّص ناتُورِيلْمُونْ مالما الزايد.`,
    pauseAfterMs: 450,
  },
  {
    id: 'beat-3',
    index: 3,
    actNumber: 3,
    actLabel: 'Beat 3 · Empathy & Pain Point',
    title: 'Empathy & Pain Point',
    direction:
      'Warm, knowing, relatable—like a close friend who gets it. Lean softly into the pause before describing the tight ring and heavy legs at the end of the day.',
    text: `علاش الزّوز مع بعضهم؟ خاطر ساعات اللّي يقلّقك هو النفخة بعد الماكلة. وساعات، حتّى كي ما كليتش برشا… تلقى خاتمك مضيّق عليك، وتحسّ بالثقل في ساقيك آخر النهار.`,
    pauseAfterMs: 500,
  },
  {
    id: 'beat-4',
    index: 4,
    actNumber: 4,
    actLabel: 'Beat 4 · Day 1 Realism',
    title: 'Day 1 Realism',
    direction:
      'Honest, grounded, calm—builds trust by not overpromising. Keep a steady, matter-of-fact pacing through the 24-hour check-in and the easy once-a-day routine.',
    text: `بعد أربعة وعشرين ساعة… ما زلت كيف بديت. تنجّم تتعدّى نهار كامل وما تلاحظ شي. بعد الغداء، ما زلت تحبّ تحلّ بُوتُونْ السروال. وكي تفيق الصباح، وجهك ما زلت تشوف فيه نفس النفخة. هوني، الرُوتِينْ ساهلة: مرّة في النهار، تاخو واحد ملّيلتر—يعني تقريب عشرين قطرة—في كاس ماء، قبل الماكلة ولّا معاها.`,
    pauseAfterMs: 550,
  },
  {
    id: 'beat-5',
    index: 5,
    actNumber: 5,
    actLabel: 'Beat 5 · Week 1 & Week 2 Micro-Wins',
    title: 'Week 1 & Week 2 Micro-Wins',
    direction:
      'Light, observational, building quiet excitement. Pronounce المَيْدَة ("el-meyda") and يِتْسَلَّعْلِكْ ("yitsalla\'lik") authentically in Tunisian Derja, with a subtle amused smile on the quoted thought «تي أنا اليوم ما حلّيتش بُوتُونْ السروال!».',
    text: `بعد جمعة… أوّل فرق تنجّم تحسّ بيه بعد الغداء. تقوم مالمَيْدَة، ترجع للخدمة، وبعد شويّة تتفكّر… «تي أنا اليوم ما حلّيتش بُوتُونْ السروال!»
ممكن في المراية ما زلت ما ريت حتّى فرق. أمّا كرشك أهون عليك، والثقل اللّي كان يقعد معاك بعد الماكلة، تنجّم تبدا تحسّ بيه أقلّ.

بعد جمعتين… تو تنجّم تلاحظو في حاجات صغار. تفيق الصباح، تغسل وجهك، تطلع في المراية… يظهرلك أقلّ منفوخ. في العشيّة، تجي باش تنحّي خاتمك، يِتْسَلَّعْلِكْ أسهل. ونفس السروال اللّي سكّرتو الصباح، تنجّم تبقى مرتاحة فيه حتّى لليل.`,
    pauseAfterMs: 650,
  },
  {
    id: 'beat-6',
    index: 6,
    actNumber: 6,
    actLabel: 'Beat 6 · Day 30 Emotional Payoff',
    title: 'Day 30 Emotional Payoff',
    direction:
      'Slow down, warm, intimate, genuine smile in the voice. Savor the evening dinner and tea scene with her husband, letting a soft knowing smile color «قدّاش من مرّة كنت نقصّ القعدة في نصّها، جُوسْتْ باش نبدّل حوايجي ونرتاح؟» before landing peacefully.',
    text: `بعد تلاثين نهار… الفرق اللّي يهمّ، تلاحظو في قعدة عاديّة. تتعشّى مع راجلك. تكمّل ماكلتك. هو يصبّ التّاي، وإنتِ ما زلت بحذاه، تحكي وتضحك. بعد شويّة تجي في مخّك… «قدّاش من مرّة كنت نقصّ القعدة في نصّها، جُوسْتْ باش نبدّل حوايجي ونرتاح؟»
هاذي هي الخفّة اللّي كنت تلوّج عليها. تاكل مرتاحة، تلبس اللّي تحبّ، ومخّك يقعد مع اللّي بحذاك.`,
    pauseAfterMs: 550,
  },
  {
    id: 'beat-7',
    index: 7,
    actNumber: 7,
    actLabel: 'Beat 7 · Offer & CTA',
    title: 'Offer & CTA',
    direction:
      'Confident, crisp, upbeat, clear direct-response energy—never shouty. Articulate Fenoa, Légèreté Plus, 89 TND two-month routine, peppermint massage oil gift, 30-day guarantee, عاللِّيَانْ اللُّوطَة, and Tunisian imperative إِخْلِصْ ("ikhlis", pay on delivery) cleanly.',
    text: `فينوا جمعَت الخمسة نباتات هاذم في فْلاكُونْ واحد. إسمو لِيجِيرْتِي بْلُوسْ. قطرات للدْرِيناجْ ناتُورِيلْ وراحة الهضم، مرّة في النهار.
تو، رُوتِينْ متاع شهرين بتسعة وثمانين دينار. تاخو زوز فْلاكُونَاتْ لِيجِيرْتِي بْلُوسْ، وكان هاذي أوّل مرّة تْكُومُونْدِي من عندنا، يجيوك معاهم زوز وِيلْ دُو مُونْتْ پْوَافْرِي للمَسَاجْ، كادُو.
عندك غارُونْتِي تلاثين نهار. كان ما قنعكش، ترجّع فلوسك. إنزل عاللِّيَانْ اللُّوطَة، إعمل كُومُونْدِي، وإِخْلِصْ كي توصلك الكُومُونْدْ.`,
    pauseAfterMs: 0,
  },
];

export const BUILT_IN_PROJECTS: AdProject[] = [
  {
    id: 'fenoa-mini-vsl',
    name: 'Fenoa Légèreté Plus — 7-Beat Mini-VSL',
    formatId: 'mini-vsl',
    styleId: 'ugc-friend',
    dialectId: 'ar-tn',
    voiceName: 'Kore',
    paceId: 'natural',
    voicePersonaOverride: DEFAULT_VOICE_PERSONA,
    beats: INITIAL_SCRIPT_BEATS,
    updatedAt: 1,
    isBuiltIn: true,
  },
  {
    id: 'template-tiktok-ugc',
    name: 'Template — 30s Tunisian TikTok UGC',
    formatId: 'tiktok-ugc',
    styleId: 'direct-response',
    dialectId: 'ar-tn',
    voiceName: 'Zephyr',
    paceId: 'brisk',
    voicePersonaOverride: '',
    beats: [
      {
        id: 'ugc-1',
        index: 1,
        actNumber: 1,
        actLabel: 'Beat 1 · Scroll-Stopper',
        title: 'Scroll-Stopper Hook',
        direction: 'Fast, curious, leaned-in TikTok hook to stop scrolling in the first 2 seconds.',
        text: 'كان كل يوم بعد الغداء تحسّ بالثقل والنفخة، إسمعني تلاثين ثانية جُوسْتْ.',
        pauseAfterMs: 250,
      },
      {
        id: 'ugc-2',
        index: 2,
        actNumber: 2,
        actLabel: 'Beat 2 · Discovery',
        title: 'Product Mechanism',
        direction: 'Bright, genuine friend sharing a real find — clear and brisk.',
        text: 'جرّبت لِيجِيرْتِي بْلُوسْ، خمسة نباتات طبيعيّة في فْلاكُونْ واحد، عشرين قطرة في كاس ماء مرّة في النهار.',
        pauseAfterMs: 250,
      },
      {
        id: 'ugc-3',
        index: 3,
        actNumber: 3,
        actLabel: 'Beat 3 · Payoff & Offer',
        title: 'Payoff & Direct CTA',
        direction: 'Confident, upbeat direct-response close with clear COD call to action.',
        text: 'من أوّل جمعة، الخفّة تبان. رُوتِينْ شهرين بتسعة وثمانين دينار، وغارُونْتِي تلاثين نهار. إنزل عاللِّيَانْ اللُّوطَة وإِخْلِصْ كي توصلك الكُومُونْدْ.',
        pauseAfterMs: 0,
      },
    ],
    updatedAt: 2,
    isBuiltIn: true,
  },
  {
    id: 'template-flash-promo',
    name: 'Template — 15s Male Flash Retargeting',
    formatId: 'flash-promo',
    styleId: 'urgent-promo',
    dialectId: 'ar-tn',
    voiceName: 'Puck',
    paceId: 'fast',
    voicePersonaOverride: '',
    beats: [
      {
        id: 'promo-1',
        index: 1,
        actNumber: 1,
        actLabel: 'Beat 1 · Offer Drop',
        title: 'Urgent Offer Hook',
        direction: 'Crisp, upbeat male creator energy — instant attention.',
        text: 'عرض الشهرين على لِيجِيرْتِي بْلُوسْ رجع اليوم بتسعة وثمانين دينار كهو!',
        pauseAfterMs: 200,
      },
      {
        id: 'promo-2',
        index: 2,
        actNumber: 2,
        actLabel: 'Beat 2 · Bonus & CTA',
        title: 'Free Gift & COD CTA',
        direction: 'Fast, clear, confident direct-response close.',
        text: 'تاخو زوز فْلاكُونَاتْ ومعاهم زوز وِيلْ دُو مُونْتْ پْوَافْرِي كادُو، وغارُونْتِي تلاثين نهار. إنزل اللُّوطَة، إعمل كُومُونْدِي، وإِخْلِصْ كي توصلك.',
        pauseAfterMs: 0,
      },
    ],
    updatedAt: 3,
    isBuiltIn: true,
  },
];

export const PRONUNCIATION_GLOSSARY: PronunciationEntry[] = [
  {
    arabic: 'الڨنّارية',
    phonetic: 'el-guenariya',
    origin: 'Tunisian hard G (ڨ)',
    category: 'tunisian',
    tip: 'Forces hard G (guenariya) while keeping coastal Tunis Qaf on فوق, تفيق, تقوم, قعدة',
  },
  {
    arabic: 'المَيْدَة',
    phonetic: 'el-meyda',
    origin: 'Tunisian vowel fix',
    category: 'tunisian',
    tip: 'Prevents TTS from slipping into classical Fusha "el-ma’ida"',
  },
  {
    arabic: 'يِتْسَلَّعْلِكْ',
    phonetic: 'yitsalla‘lik',
    origin: 'Tunisian Derja verb',
    category: 'tunisian',
    tip: 'Full diacritics prevent stumbling on this purely Tunisian verb ("slips off easily")',
  },
  {
    arabic: 'إِخْلِصْ',
    phonetic: 'ikhlis',
    origin: 'Tunisian imperative',
    category: 'tunisian',
    tip: 'Ensures Tunisian imperative "pay" instead of classical "akhlas"',
  },
  {
    arabic: 'السّْكَنْجْبِيرْ',
    phonetic: 'es-skanjbir',
    origin: 'Tunisian Derja noun',
    category: 'tunisian',
    tip: 'Natural Tunisian cluster for ginger rather than stiff Fusha pacing',
  },
  {
    arabic: 'عاللِّيَانْ اللُّوطَة',
    phonetic: '‘al-lien el-louta',
    origin: 'Tunisian + French lien',
    category: 'tunisian',
    tip: 'Vocalized so "click the link below" flows naturally in Tunisian Derja',
  },
  {
    arabic: 'للدْرِيناجْ',
    phonetic: 'lid-drénage',
    origin: 'drainage',
    category: 'french',
    tip: 'Soft French "drénaj", integrated with Tunisian prefix "lil-"',
  },
  {
    arabic: 'پُوندُونْ',
    phonetic: 'pendant',
    origin: 'pendant',
    category: 'french',
    tip: 'Spelled with پ for crisp initial "p" and natural French nasal vowels',
  },
  {
    arabic: 'دُوزْ',
    phonetic: 'dose',
    origin: 'dose',
    category: 'french',
    tip: 'Short, natural Tunisian-French "dôz"',
  },
  {
    arabic: 'إيكْسْتْرِي',
    phonetic: 'extraits',
    origin: 'extraits',
    category: 'french',
    tip: 'Pronounced "ekstré" without over-emphasizing the Arabic hamza',
  },
  {
    arabic: 'الأُورْتُوسِيفُونْ',
    phonetic: 'l’orthosiphon',
    origin: 'orthosiphon',
    category: 'french',
    tip: 'Smooth botanical pronunciation: "l-ortosifon"',
  },
  {
    arabic: 'الپِيسُونْلِي',
    phonetic: 'el-pissenlit',
    origin: 'pissenlit',
    category: 'french',
    tip: 'Silent final "t", crisp "p": "el-pissonli"',
  },
  {
    arabic: 'ناتُورِيلْمُونْ',
    phonetic: 'naturellement',
    origin: 'naturellement',
    category: 'french',
    tip: 'Fluid everyday Tunisian cadence, soft final nasal',
  },
  {
    arabic: 'بُوتُونْ',
    phonetic: 'bouton',
    origin: 'bouton',
    category: 'french',
    tip: 'Everyday Tunisian borrowing for trouser button',
  },
  {
    arabic: 'الرُوتِينْ',
    phonetic: 'er-routine',
    origin: 'routine',
    category: 'french',
    tip: 'Natural French "u" softened slightly in Derja',
  },
  {
    arabic: 'جُوسْتْ',
    phonetic: 'juste',
    origin: 'juste',
    category: 'french',
    tip: 'Conversational "jüst" inside the quoted thought',
  },
  {
    arabic: 'فْلاكُونْ / فْلاكُونَاتْ',
    phonetic: 'flacon / flaconet',
    origin: 'flacon',
    category: 'french',
    tip: 'Singular French "flakon", Tunisian plural "flakonét"',
  },
  {
    arabic: 'لِيجِيرْتِي بْلُوسْ',
    phonetic: 'Légèreté Plus',
    origin: 'Légèreté Plus',
    category: 'french',
    tip: 'Clear product name: "Léjèrté Plus" with crisp "s"',
  },
  {
    arabic: 'تْكُومُونْدِي / كُومُونْدْ',
    phonetic: 'tcommandi / commande',
    origin: 'commander',
    category: 'french',
    tip: 'Classic Tunisian-French hybrid verb and noun',
  },
  {
    arabic: 'وِيلْ دُو مُونْتْ پْوَافْرِي',
    phonetic: 'huile de menthe poivrée',
    origin: 'huile de menthe poivrée',
    category: 'french',
    tip: 'Fluid French phrase for peppermint massage oil',
  },
  {
    arabic: 'كادُو',
    phonetic: 'cadeau',
    origin: 'cadeau',
    category: 'french',
    tip: 'Warm, light lift on "kadô"',
  },
  {
    arabic: 'غارُونْتِي',
    phonetic: 'garantie',
    origin: 'garantie',
    category: 'french',
    tip: 'Tunisian voiced velar "g/gh" + French "rantî"',
  },
];

export function countScriptWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((token) => token.replace(/[«»…،.؟!:"'()—-]/g, '').length > 0).length;
}

export const countArabicWords = countScriptWords;

export function estimateDurationSeconds(
  beats: ScriptBeat[],
  paceId: PacePreset['id'],
  pauseScale = 1
): number {
  const pace = PACE_PRESETS.find((p) => p.id === paceId) ?? PACE_PRESETS[1];
  const words = beats.reduce((sum, b) => sum + countScriptWords(b.text), 0);
  const ellipsisCount = beats.reduce(
    (sum, b) => sum + (b.text.match(/…|\.\.\./g)?.length ?? 0),
    0
  );
  const beatPausesSec =
    beats
      .slice(0, -1)
      .reduce((sum, b) => sum + Math.round(b.pauseAfterMs * pauseScale), 0) / 1000;
  const speechSec = (words / pace.wpm) * 60;
  return Math.max(0, speechSec + ellipsisCount * 0.45 + beatPausesSec);
}
