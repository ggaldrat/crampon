import {Platform} from 'react-native';

const JSDELIVR_BASE =
  'https://cdn.jsdelivr.net/gh/a-ghorbani/pocketpal-device-rules@main';

// Crampon publishes its own Android rules (upstream rules + phone-tested picks
// from the Crampon model watch, regenerated daily by
// doc/compute_recommendations.py). iOS keeps the upstream file.
const CRAMPON_BASE = 'https://crampon.blandy-studio.com/rules';

// The advisory rules repo serves one file per platform. iPadOS reports as
// 'ios', so the iOS rules file covers iPad too.
export const getRulesUrl = (
  platform: 'ios' | 'android' = Platform.OS as 'ios' | 'android',
): string =>
  `${platform === 'android' ? CRAMPON_BASE : JSDELIVR_BASE}/rules.${platform}.v2.json`;
