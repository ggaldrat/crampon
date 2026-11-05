import {RuleCandidate, Rules} from './recommend';

export type TierGap = {app: string[]; reference: string[]};

export type Comparison = {
  agree: boolean;
  /** Tiers whose candidate lists differ, with both lists. */
  gaps: Record<string, TierGap>;
  /** Tiers where the app's first model is still waiting in the reference. */
  pendingHeads: Record<string, string>;
};

const key = (c: RuleCandidate) => `${c.hf_repo}/${c.hf_filename}`;

/**
 * Compares the rules computed on the phone with the reference (the GitHub
 * watch), tier by tier, on the ordered list of model files. The reference
 * publishes a new first model only after two runs in a row: when the phone's
 * first model differs but the reference's is in the phone's list, the
 * reference's goes first before comparing, and the wait is noted.
 */
export const compareRules = (app: Rules, reference: Rules): Comparison => {
  const gaps: Record<string, TierGap> = {};
  const pendingHeads: Record<string, string> = {};
  const tiers = new Set([
    ...Object.keys(app.tiers ?? {}),
    ...Object.keys(reference.tiers ?? {}),
  ]);
  for (const t of tiers) {
    const ref = (reference.tiers?.[t]?.candidates ?? []).map(key);
    let mine = (app.tiers?.[t]?.candidates ?? []).map(key);
    if (
      ref.length &&
      mine.length &&
      mine[0] !== ref[0] &&
      mine.includes(ref[0])
    ) {
      pendingHeads[t] = mine[0];
      mine = [ref[0], ...mine.filter(k => k !== ref[0])];
    }
    if (mine.join('\n') !== ref.join('\n')) {
      gaps[t] = {app: mine, reference: ref};
    }
  }
  return {agree: Object.keys(gaps).length === 0, gaps, pendingHeads};
};
