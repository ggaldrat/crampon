/**
 * Crampon's model watch run on the phone, compared with the reference that
 * .github/workflows/crampon-veille.yml publishes. Same inputs as the
 * reference (Hugging Face, Artificial Analysis, PocketPal's rules, the hand
 * tests), same computation, then a tier by tier comparison. The phone does not
 * act on its result yet: the reference stays the source of the rules.
 */
import {parseBenchmark, BENCHMARK_URL} from './benchmark';
import {Catalogue, refreshCatalogue, sizesOf} from './catalogue';
import {compareRules, Comparison} from './compare';
import {computeRules, parseCsv, Rules} from './recommend';
import supportedArchs from './supportedArchs.json';
import {getRulesUrls} from '../deviceRules/rulesUrls';

const POCKETPAL_RULES_URL =
  'https://raw.githubusercontent.com/a-ghorbani/pocketpal-device-rules/main/rules.android.v2.json';
const COMPAT_URL =
  'https://raw.githubusercontent.com/ggaldrat/crampon/veille-data/modeles_compatibilite.csv';
const TIMEOUT_MS = 60_000;

const get = async (url: string, headers?: Record<string, string>) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {signal: controller.signal, headers});
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

export type VeilleResult = Comparison & {
  referenceVersion?: string;
  pocketpalVersion?: string;
  /** False when the reference was computed from older PocketPal rules: a gap is then expected. */
  samePocketpalRules: boolean;
  llamaRn: string;
  repos: number;
  benchmarkRows: number;
  unreadPublishers: string[];
  rules: Rules;
};

/** One run; `catalogue` is updated in place and kept by the caller. */
export const runVeille = async (
  catalogue: Catalogue,
): Promise<VeilleResult> => {
  const pocketpalRules: Rules = await (await get(POCKETPAL_RULES_URL)).json();
  const reference: Rules = await (await get(getRulesUrls('android')[0])).json();
  const compat = parseCsv(await (await get(COMPAT_URL)).text());
  const benchmark = parseBenchmark(
    await (await get(BENCHMARK_URL, {'User-Agent': 'Mozilla/5.0'})).text(),
  );
  const unreadPublishers = await refreshCatalogue(catalogue);
  const rules = await computeRules({
    pocketpalRules,
    catalogue,
    benchmark,
    compat,
    supportedArchs: new Set(supportedArchs.archs),
    sizesOf: repo => sizesOf(catalogue, repo),
  });
  return {
    ...compareRules(rules, reference),
    referenceVersion: reference.rules_version,
    pocketpalVersion: pocketpalRules.rules_version,
    samePocketpalRules:
      reference.rules_version?.split('+')[0] === pocketpalRules.rules_version,
    llamaRn: supportedArchs.llamaRn,
    repos: Object.keys(catalogue).length,
    benchmarkRows: benchmark.length,
    unreadPublishers,
    rules,
  };
};
