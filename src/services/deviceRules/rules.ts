import {Platform} from 'react-native';

import {parseDeviceRules} from './parse';
import {getRulesUrls} from './rulesUrls';
import {DeviceRules, Tier} from './types';

// Online fetch of `rules.<platform>.v2.json`, from each source in turn. Returns
// null (→ bundled floor) when every source fails: network error, non-2xx,
// parse throw, platform mismatch, or a parse that yields zero models across all
// tiers (an incompatible hosted JSON). Never throws.

const FETCH_TIMEOUT_MS = 10_000;
const TIERS: Tier[] = ['low', 'mid', 'high', 'flagship'];

const hasAnyModels = (rules: DeviceRules): boolean =>
  TIERS.some(tier => rules.tiers[tier].models.length > 0);

export async function fetchRules(
  appVersion: string,
  platform: 'ios' | 'android' = Platform.OS as 'ios' | 'android',
): Promise<DeviceRules | null> {
  for (const url of getRulesUrls(platform)) {
    const rules = await fetchRulesFrom(url, appVersion, platform);
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
): Promise<DeviceRules | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const json = await response.json();
    const rules = parseDeviceRules(json, appVersion);
    if (rules.platform !== platform) {
      return null;
    }
    // A model-less doc (wrong tier shape, or every candidate gated out) parses
    // cleanly but resolves an empty list; fall to the bundled floor instead.
    if (!hasAnyModels(rules)) {
      return null;
    }
    return rules;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
