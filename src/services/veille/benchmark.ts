/**
 * Artificial Analysis phone benchmark, read from its live page: the port of
 * veille/refresh_mobile_benchmark.py, keeping only what the rules use (the 16K
 * score and the end-to-end time on the Android phone).
 */
export const BENCHMARK_URL =
  'https://artificialanalysis.ai/hardware-inference-stack/mobile-phones';
const ANDROID = 'Galaxy S26 Ultra';
/** Fewer builds than this: the page changed, its data is not trusted. */
const MIN_ROWS = 20;

export type BenchmarkRow = {
  model: string;
  quant: string;
  /** Mean of the five evaluations, out of 100. */
  score16k: number | null;
  /** Seconds for a 1,024-token prompt and a 256-token answer. */
  s26E2eS: number | null;
};

type Eval = {score?: number | null} | undefined;
type EvalScores = {
  omniscience?: {accuracy?: number; hallucinationRate?: number};
  bfcl_small?: Eval;
  ifbench?: Eval;
  gpqa?: Eval;
  math_500?: Eval;
};
type PageData = {
  devices: {deviceKey: string; name: string}[];
  models: {
    modelId: string;
    name: string;
    quant: string;
    servedContextTokens: number;
    evalScores: EvalScores;
  }[];
  measurements: {
    modelId: string;
    deviceKey: string;
    metric: string;
    prefillTokens: number;
    value: number;
  }[];
};

/** Python's round(): halves go to the even neighbour. */
export const pyRound = (x: number, digits = 0): number => {
  const f = 10 ** digits;
  const v = x * f;
  const floor = Math.floor(v);
  const diff = v - floor;
  let r: number;
  if (Math.abs(diff - 0.5) < 1e-9) {
    r = floor % 2 === 0 ? floor : floor + 1;
  } else {
    r = Math.round(v);
  }
  return r / f;
};

/** End of the JSON value starting at `start` (an object or array). */
const jsonEnd = (text: string, start: number): number => {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') {
        i++;
      } else if (ch === '"') {
        inString = false;
      }
    } else if (ch === '"') {
      inString = true;
    } else if (ch === '{' || ch === '[') {
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }
  }
  throw new Error('unterminated JSON in the page data');
};

/** {devices, models, measurements} rebuilt from the Next.js payload chunks. */
export const pageData = (html: string): PageData => {
  const chunks = [
    ...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g),
  ].map(m => JSON.parse(`"${m[1]}"`) as string);
  const text = chunks.join('');
  const start = text.indexOf('{"devices":');
  if (start < 0) {
    throw new Error('benchmark data not found in the page');
  }
  return JSON.parse(text.slice(start, jsonEnd(text, start)));
};

const score = (e: EvalScores): number | null => {
  const o = e.omniscience;
  const parts = [e.bfcl_small, e.ifbench, e.gpqa, e.math_500].map(
    x => x?.score,
  );
  if (
    o?.accuracy == null ||
    o.hallucinationRate == null ||
    parts.some(p => p == null)
  ) {
    return null;
  }
  const omni = (o.accuracy + 1 - o.hallucinationRate) / 2;
  return pyRound(20 * ((parts as number[]).reduce((a, b) => a + b, 0) + omni));
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One row per build (model + quantization + mode), best score first. */
export const parseBenchmark = (html: string): BenchmarkRow[] => {
  const d = pageData(html);
  const devices = new Map(d.devices.map(x => [x.deviceKey, x.name]));
  const e2e = new Map<string, number>();
  for (const m of d.measurements) {
    if (
      devices.get(m.deviceKey) === ANDROID &&
      m.metric === 'end_to_end_latency' &&
      m.prefillTokens === 1024
    ) {
      e2e.set(m.modelId, m.value);
    }
  }
  const rows = new Map<string, BenchmarkRow>();
  for (const m of d.models) {
    const name = m.name
      .replace(/\s*\((16|64)K Context\)/g, '')
      .replace(new RegExp(',\\s*' + escapeRegExp(m.quant) + '\\)', 'g'), ')')
      .split(` (${m.quant})`)
      .join('');
    const key = `${name}\u0000${m.quant}`;
    if (!rows.has(key)) {
      rows.set(key, {
        model: name,
        quant: m.quant,
        score16k: null,
        s26E2eS: null,
      });
    }
    if (m.servedContextTokens === 65536) {
      continue;
    }
    const row = rows.get(key)!;
    row.score16k = score(m.evalScores) || null;
    const ms = e2e.get(m.modelId);
    if (ms) {
      row.s26E2eS = pyRound(ms / 1000, 1);
    }
  }
  const out = [...rows.values()].sort(
    (a, b) => (b.score16k ?? 0) - (a.score16k ?? 0),
  );
  if (out.length < MIN_ROWS) {
    throw new Error(`only ${out.length} benchmark builds, page changed`);
  }
  return out;
};
