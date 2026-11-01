import Speech from '@pocketpalai/react-native-speech';

import type {Voice} from '../../types';

/**
 * Raw OS voice as returned by the native module. `requiresNetwork` and
 * `notInstalled` come from Crampon's patch of the Android module
 * (patches/@pocketpalai+react-native-speech+*.patch); they are absent on iOS.
 */
export interface SystemVoiceInfo {
  identifier: string;
  name?: string;
  language: string;
  quality?: string;
  requiresNetwork?: boolean;
  notInstalled?: boolean;
}

const toVoice = (v: SystemVoiceInfo): Voice => ({
  id: v.identifier,
  name: v.name ?? v.identifier,
  engine: 'system',
  language: v.language,
});

/**
 * Fetch the OS-provided voice catalog and map it onto our generic `Voice`
 * shape.
 */
export const getSystemVoices = async (): Promise<Voice[]> => {
  const voices = (await Speech.getAvailableVoices()) as SystemVoiceInfo[];
  return voices.map(toVoice);
};

/** BCP-47 tag of the phone's locale, e.g. `fr-FR`. */
export const getDeviceLocale = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  } catch {
    return 'en-US';
  }
};

/**
 * Crampon picks the voice itself: an offline voice whose data is on the
 * phone, in the phone's language. Exact locale (fr-FR) beats the bare
 * language (fr-CA for a fr-FR phone); enhanced quality breaks ties.
 * Returns null when the phone has no usable voice for that language.
 */
export const pickSystemVoice = (
  voices: SystemVoiceInfo[],
  locale: string,
): Voice | null => {
  const wanted = locale.toLowerCase();
  const language = wanted.split('-')[0];
  const score = (v: SystemVoiceInfo): number => {
    const tag = v.language.toLowerCase();
    const sameLanguage = tag.split('-')[0] === language;
    if (!sameLanguage || v.requiresNetwork || v.notInstalled) {
      return -1;
    }
    return (tag === wanted ? 2 : 0) + (v.quality === 'Enhanced' ? 1 : 0);
  };
  const best = voices
    .map(v => ({v, s: score(v)}))
    .filter(({s}) => s >= 0)
    .sort((a, b) => b.s - a.s)[0];
  return best ? toVoice(best.v) : null;
};

/** The voice Crampon uses on this phone, or null if none is installed. */
export const resolveAutoSystemVoice = async (): Promise<Voice | null> => {
  const voices = (await Speech.getAvailableVoices()) as SystemVoiceInfo[];
  return pickSystemVoice(voices, getDeviceLocale());
};
