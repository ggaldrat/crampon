import {Platform} from 'react-native';

import {parseDeviceRules} from './parse';
import {getRulesUrls} from './rulesUrls';
import {RulesSignature, verifyRules} from './signature';
import {DeviceRules, Tier} from './types';

// Online fetch of `rules.<platform>.v2.json`, from each source in turn. Returns
// null (→ bundled floor) when every source fails: network error, non-2xx,
// parse throw, platform mismatch, or a parse that yields zero models across all
// tiers (an incompatible hosted JSON). Never throws.
//
// Crampon (Android): the rules must carry a valid Crampon signature
// (`<url>.sig`, see signature.ts), signed no earlier than `minSignedAt`, the
// last signature accepted, so that no source can serve older rules again.

const FETCH_TIMEOUT_MS = 10_000;
const TIERS: Tier[] = ['low', 'mid', 'high', 'flagship'];

const hasAnyModels = (rules: DeviceRules): boolean =>
  TIERS.some(tier => rules.tiers[tier].models.length > 0);

export async function fetchRules(
  appVersion: string,
  platform: 'ios' | 'android' = Platform.OS as 'ios' | 'android',
  minSignedAt: string | null = null,
): Promise<DeviceRules | null> {
  for (const url of getRulesUrls(platform)) {
    const rules = await fetchRulesFrom(url, appVersion, platform, minSignedAt);
    if (rules) {
      return {...rules, source: url};
    }
  }
  return null;
}

async function fetchRulesFrom(
  url: string,
  appVersion: string,
  platform: 'ios' | 'android',
  minSignedAt: string | null,
): Promise<DeviceRules | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const signed = platform === 'android';
    const [response, sigResponse] = await Promise.all([
      fetch(url, {signal: controller.signal}),
      signed ? fetch(`${url}.sig`, {signal: controller.signal}) : null,
    ]);
    if (!response.ok || (sigResponse && !sigResponse.ok)) {
      return null;
    }
    const text = await response.text();
    let signedAt: string | undefined;
    if (sigResponse) {
      const sig: RulesSignature = await sigResponse.json();
      const at = verifyRules(text, sig);
      if (!at || (minSignedAt && at < minSignedAt)) {
        return null;
      }
      signedAt = at;
    }
    const rules = parseDeviceRules(JSON.parse(text), appVersion);
    if (rules.platform !== platform) {
      return null;
    }
    // A model-less doc (wrong tier shape, or every candidate gated out) parses
    // cleanly but resolves an empty list; fall to the bundled floor instead.
    if (!hasAnyModels(rules)) {
      return null;
    }
    return signedAt ? {...rules, signedAt} : rules;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
