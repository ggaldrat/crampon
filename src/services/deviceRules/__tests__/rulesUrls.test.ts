import {getRulesUrls} from '../rulesUrls';

describe('getRulesUrls', () => {
  it.each([
    [
      'android',
      [
        'https://raw.githubusercontent.com/ggaldrat/crampon/veille-data/rules/rules.android.v2.json',
        'https://crampon.blandy-studio.com/rules/rules.android.v2.json',
      ],
    ],
    [
      'ios',
      [
        'https://cdn.jsdelivr.net/gh/a-ghorbani/pocketpal-device-rules@main/rules.ios.v2.json',
      ],
    ],
  ] as const)('points %s at the v2 rules files', (platform, urls) => {
    expect(getRulesUrls(platform)).toEqual(urls);
  });
});
