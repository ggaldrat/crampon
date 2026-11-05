/**
 * GGUF models on Hugging Face, from a list of trusted publishers: the port of
 * veille/refresh_hf_catalogue.py. File sizes are read only for the repos the
 * rules may use (see recommend.ts), not for the whole catalogue.
 */
const HF_API = 'https://huggingface.co/api/models';
/** Converters first: the preferred publisher when several publish a model. */
export const PUBLISHERS = [
  'lmstudio-community',
  'unsloth',
  'bartowski',
  'ggml-org',
  'Qwen',
  'LiquidAI',
  'google',
  'ibm-granite',
  'microsoft',
  'mistralai',
  'HuggingFaceTB',
  'allenai',
  'nvidia',
  'deepseek-ai',
  'openbmb',
  'tiiuae',
  'prism-ml',
  'meta-llama',
];
const MAX_PARAMS = 9.5e9;
const EXCLUDED_ARCHS = new Set([
  'clip',
  'bert',
  'modern-bert',
  'nomic-bert',
  'nomic-bert-moe',
  'neo-bert',
  'jina-bert-v2',
  'jina-bert-v3',
  'eurobert',
  't5encoder',
  'wavtokenizer-dec',
  'gemma-embedding',
  'llama-embed',
  'pangu-embedded',
  'qwen3tts',
  'pockettts',
  'eagle3',
  'dflash',
  'gemma4-assistant',
]);
const EXCLUDED_NAME =
  /embed|rerank|dflash|draft|eagle|tts|-mtp\b|mmproj|audio|voxtral|whisper|asr|speech|encoder|colbert|models-moved/i;
export const QUANTS = ['Q4_K_M', 'Q4_0', 'Q8_0'] as const;
/** Pause between two Hugging Face calls (rate limit: 429 errors). */
const PAUSE_MS = 1000;
const TIMEOUT_MS = 60_000;

/** {quant: [file, bytes]} for the tracked quantizations. */
export type Sizes = Partial<Record<(typeof QUANTS)[number], [string, number]>>;

export type CatalogueEntry = {
  publisher: string;
  baseModel: string;
  architecture: string;
  params: number;
  downloads: number;
  lastModified: string;
  createdAt: string;
  sizes?: Sizes;
  /** lastModified of the repo when its sizes were read. */
  sizesOf?: string;
};

/** Repo id → entry, kept between runs like catalogue.json. */
export type Catalogue = Record<string, CatalogueEntry>;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getJson = async (url: string): Promise<any> => {
  for (let attempt = 0; ; attempt++) {
    await sleep(attempt === 0 ? PAUSE_MS : 60_000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {signal: controller.signal});
      // Rate limit: one long pause, one more try.
      if (response.status === 429 && attempt === 0) {
        continue;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
};

type HfModel = {
  id: string;
  gguf?: {total?: number; architecture?: string};
  gated?: unknown;
  tags?: string[];
  downloads?: number;
  lastModified?: string;
  createdAt?: string;
};

const listPublisher = (publisher: string): Promise<HfModel[]> => {
  const params = [
    ['author', publisher],
    ['filter', 'gguf'],
    ['sort', 'lastModified'],
    ['direction', '-1'],
    ['limit', '200'],
    ...[
      'gguf',
      'gated',
      'tags',
      'downloads',
      'lastModified',
      'pipeline_tag',
      'createdAt',
    ].map(k => ['expand[]', k]),
  ]
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return getJson(`${HF_API}?${params}`);
};

export const baseModel = (m: HfModel): string => {
  const tags = m.tags ?? [];
  const quantized = tags.find(t => t.startsWith('base_model:quantized:'));
  if (quantized) {
    return quantized.split(':').slice(2).join(':');
  }
  const base = tags.find(
    t => t.startsWith('base_model:') && t.split(':').length === 2,
  );
  return base ? base.split(':')[1] : m.id;
};

/**
 * Adds the publishers' current GGUF repos to `catalogue`, in place. Repos
 * no longer listed stay, as in the reference. Returns the publishers that
 * could not be read.
 */
export const refreshCatalogue = async (
  catalogue: Catalogue,
): Promise<string[]> => {
  const failed: string[] = [];
  for (const publisher of PUBLISHERS) {
    let models: HfModel[];
    try {
      models = await listPublisher(publisher);
    } catch {
      failed.push(publisher);
      continue;
    }
    for (const m of models) {
      const total = m.gguf?.total ?? 0;
      const arch = m.gguf?.architecture ?? '';
      if (
        m.gated ||
        !total ||
        total > MAX_PARAMS ||
        EXCLUDED_ARCHS.has(arch) ||
        EXCLUDED_NAME.test(m.id)
      ) {
        continue;
      }
      catalogue[m.id] = {
        ...catalogue[m.id],
        publisher,
        baseModel: baseModel(m),
        architecture: arch,
        params: total,
        downloads: m.downloads ?? 0,
        lastModified: m.lastModified ?? '',
        createdAt: (m.createdAt ?? '').slice(0, 10),
      };
    }
  }
  return failed;
};

/** The tracked quantizations of a repo (no split files), cached by lastModified. */
export const sizesOf = async (
  catalogue: Catalogue,
  repo: string,
): Promise<Sizes> => {
  const e = catalogue[repo];
  if (e.sizes && e.sizesOf === e.lastModified) {
    return e.sizes;
  }
  const files: {path?: string; size: number}[] = await getJson(
    `${HF_API}/${repo}/tree/main?recursive=1`,
  );
  const sizes: Sizes = {};
  for (const f of files) {
    const p = f.path ?? '';
    // no vision projector, MTP head, audio tokenizer or split file
    if (
      !p.toLowerCase().endsWith('.gguf') ||
      /mmproj|mtp|tokenizer/i.test(p) ||
      /-\d{5}-of-\d{5}/.test(p)
    ) {
      continue;
    }
    for (const q of QUANTS) {
      if (
        new RegExp(`[-_.]${q}[-_.]`, 'i').test(p) &&
        (!sizes[q] || f.size < sizes[q]![1])
      ) {
        sizes[q] = [p, f.size];
      }
    }
  }
  e.sizes = sizes;
  e.sizesOf = e.lastModified;
  return sizes;
};
