/**
 * The app's rules computed on the phone: the port of the rules part of
 * veille/compute_recommendations.py (publier_regles). PocketPal's published
 * rules, plus the GGUF models validated on a phone (a hand test marked
 * "confirme", or an Artificial Analysis time on the Android phone of at most
 * SLOW_S seconds). Not ported: recommendations.csv, min_app_version (this
 * phone runs its own engine) and the head stabilization, which compare.ts
 * takes from the reference.
 */
import {BenchmarkRow, pyRound} from './benchmark';
import {Catalogue, PUBLISHERS, Sizes} from './catalogue';

/** Lowest device RAM per tier (bottom of the rules' ram_band), in GB. */
const TIERS: [string, number][] = [
  ['low', 4],
  ['mid', 6],
  ['high', 6],
  ['flagship', 12],
];
/** Android kills the app beyond about 65 % of the RAM. */
const USABLE_SHARE = 0.65;
/** Beyond this, AA's typical answer is too slow on Android. */
const SLOW_S = 30;
/** The hand tests that count: those run with the app's engine. */
const ENGINE = 'llama.cpp';

export type RuleCandidate = {
  model: string;
  hf_repo?: string;
  hf_filename?: string;
  [key: string]: unknown;
};
export type Rules = {
  rules_version?: string;
  tiers: Record<string, {candidates?: RuleCandidate[]; [key: string]: unknown}>;
  [key: string]: unknown;
};

export type CompatRow = Record<string, string>;

/** Identifier comparable between rules, GGUF repos and the benchmark. */
export const normalize = (name: string): string =>
  (name.split('/').pop() ?? '')
    .toLowerCase()
    .replace(
      /-gguf$|gguf|-instruct|-it\b|\(reasoning\)|\(non-reasoning\)|reasoning|-chat\b/g,
      '',
    )
    .replace(/[^a-z0-9]/g, '');

/** RAM in use estimated from the file size (fitted on the rules' min_ram_gb). */
const estimatedRam = (gb: number) => pyRound(gb * 1.3 + 0.7, 1);

/** Minimal CSV reader: quoted fields, doubled quotes, no newline in a field. */
export const parseCsv = (text: string): CompatRow[] => {
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  const split = (line: string): string[] => {
    const out: string[] = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          field += '"';
          i++;
        } else if (ch === '"') {
          quoted = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        out.push(field);
        field = '';
      } else {
        field += ch;
      }
    }
    out.push(field);
    return out;
  };
  const [header, ...rows] = lines.map(split);
  return (rows ?? []).map(r =>
    Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])),
  );
};

/** {normalized model: row} for the llama.cpp hand tests. */
export const compatByModel = (rows: CompatRow[]): Map<string, CompatRow> =>
  new Map(
    rows
      .filter(r => (r.moteur ?? ENGINE) === ENGINE)
      .map(r => [normalize(r.model), r]),
  );

/** {model: [16K score, seconds on the Android phone]}, best mode first. */
export const scoresByModel = (
  rows: BenchmarkRow[],
): Map<string, [number, number | null]> => {
  const out = new Map<string, [number, number | null]>();
  for (const r of rows) {
    if (!r.score16k) {
      continue;
    }
    const n = normalize(r.model);
    const sc = Math.trunc(r.score16k);
    if (!out.has(n) || sc > out.get(n)![0]) {
      out.set(n, [sc, r.s26E2eS]);
    }
  }
  return out;
};

type Validated = {tier: string; score: number | null; rule: RuleCandidate};

export type ComputeInput = {
  pocketpalRules: Rules;
  catalogue: Catalogue;
  benchmark: BenchmarkRow[];
  compat: CompatRow[];
  supportedArchs: Set<string>;
  sizesOf: (repo: string) => Promise<Sizes>;
};

export const computeRules = async ({
  pocketpalRules,
  catalogue,
  benchmark,
  compat: compatRows,
  supportedArchs,
  sizesOf,
}: ComputeInput): Promise<Rules> => {
  const compat = compatByModel(compatRows);
  const scores = scoresByModel(benchmark);
  const failedTest = (n: string) => compat.get(n)?.compatibilite === 'echec';

  const known = new Set<string>();
  for (const tier of Object.values(pocketpalRules.tiers ?? {})) {
    for (const c of tier.candidates ?? []) {
      known.add(normalize(c.hf_repo || c.model));
      known.add(normalize(c.model));
    }
  }

  // Repos by base model, preferred publisher then most downloaded first.
  const byBase = new Map<string, string[]>();
  for (const [id, e] of Object.entries(catalogue)) {
    if (!supportedArchs.has(e.architecture)) {
      continue;
    }
    const b = normalize(e.baseModel);
    byBase.set(b, [...(byBase.get(b) ?? []), id]);
  }
  const rank = (id: string) => {
    const i = PUBLISHERS.indexOf(catalogue[id].publisher);
    return i < 0 ? 99 : i;
  };

  const validated: Validated[] = [];
  for (const [b, repos] of byBase) {
    if (known.has(b) || failedTest(b)) {
      continue;
    }
    const [sc, s26] = scores.get(b) ?? [null, null];
    const tested = compat.get(b)?.compatibilite === 'confirme';
    // validated on a phone (hand test, or AA time on Android) and not too slow
    if (!(tested || s26 !== null) || (s26 !== null && s26 > SLOW_S)) {
      continue;
    }
    // the preferred repo that has a 4-bit file; sizes read only here
    const ordered = [...repos].sort(
      (x, y) =>
        rank(x) - rank(y) || catalogue[y].downloads - catalogue[x].downloads,
    );
    let pick: {id: string; file: string; bytes: number} | null = null;
    for (const id of ordered) {
      const sizes = await sizesOf(id);
      const q = sizes.Q4_K_M ?? sizes.Q4_0;
      if (q) {
        pick = {id, file: q[0], bytes: q[1]};
        break;
      }
    }
    if (!pick) {
      continue;
    }
    const ram = estimatedRam(pick.bytes / 1e9);
    const tier = TIERS.find(([, gb]) => ram <= gb * USABLE_SHARE)?.[0];
    if (!tier) {
      continue;
    }
    const e = catalogue[pick.id];
    validated.push({
      tier,
      score: sc,
      rule: {
        model: b,
        display_name: (e.baseModel.split('/').pop() ?? '').replace(
          /-gguf$/i,
          '',
        ),
        quant: (pick.file.split('-').pop() ?? '').slice(0, -5).toLowerCase(),
        hf_repo: pick.id,
        hf_filename: pick.file,
        params: e.params,
        size_bytes: pick.bytes,
        min_ram_gb: ram,
        _source: 'crampon-app',
      },
    });
  }
  return publish(pocketpalRules, validated, scores);
};

/**
 * PocketPal's rules plus the validated models. A model goes first in a tier
 * when it beats the best AA score already there (or, hand-tested without a
 * score, in its own tier); otherwise it goes last, in its own tier only.
 */
const publish = (
  rules: Rules,
  validated: Validated[],
  scores: Map<string, [number, number | null]>,
): Rules => {
  const out: Rules = JSON.parse(JSON.stringify(rules));
  const order = TIERS.map(([t]) => t);
  const sorted = [...validated].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  for (const [g, tier] of Object.entries(out.tiers ?? {})) {
    const old = tier.candidates ?? [];
    const best = Math.max(
      0,
      ...old.flatMap(c =>
        [normalize(c.hf_repo || c.model), normalize(c.model)]
          .filter(n => scores.has(n))
          .map(n => scores.get(n)![0]),
      ),
    );
    const below = order.includes(g) ? order.slice(0, order.indexOf(g) + 1) : [];
    const fresh = sorted.filter(c => below.includes(c.tier));
    const head = fresh
      .filter(c => (c.score ?? 0) > best || (c.score === null && c.tier === g))
      .map(c => c.rule);
    const tail = fresh
      .filter(c => !head.includes(c.rule) && c.tier === g)
      .map(c => c.rule);
    const keys = new Set(
      [...head, ...tail].map(c => `${c.hf_repo}/${c.hf_filename}`),
    );
    tier.candidates = [
      ...head,
      ...old.filter(c => !keys.has(`${c.hf_repo}/${c.hf_filename}`)),
      ...tail,
    ];
  }
  out.rules_version = `${rules.rules_version}+crampon-app`;
  return out;
};
