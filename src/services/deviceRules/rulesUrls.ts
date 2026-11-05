import {Platform} from 'react-native';

const JSDELIVR_BASE =
  'https://cdn.jsdelivr.net/gh/a-ghorbani/pocketpal-device-rules@main';

// Crampon publishes its own Android rules (upstream rules + phone-tested picks
// from the Crampon model watch, veille/compute_recommendations.py): on GitHub
// every 6 hours (.github/workflows/crampon-veille.yml, veille-data branch),
// and on BlandyStudio as a fallback. iOS keeps the upstream file.
const CRAMPON_BASES = [
  'https://raw.githubusercontent.com/ggaldrat/crampon/veille-data/rules',
  'https://crampon.blandy-studio.com/rules',
];

// The advisory rules repo serves one file per platform. iPadOS reports as
// 'ios', so the iOS rules file covers iPad too. Sources in order of
// preference: the first one that serves usable rules wins.
export const getRulesUrls = (
  platform: 'ios' | 'android' = Platform.OS as 'ios' | 'android',
): string[] =>
  (platform === 'android' ? CRAMPON_BASES : [JSDELIVR_BASE]).map(
    base => `${base}/rules.${platform}.v2.json`,
  );
