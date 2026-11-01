import {Alert} from 'react-native';

import {ttsStore} from '../../store';
import type {l10n as locales} from '../../locales';

/**
 * Crampon picks the phone's offline voice itself; when the phone has none
 * for its language, only Android can install it. Point the user there.
 */
export const promptMissingVoice = (l10n: (typeof locales)['en']) => {
  Alert.alert(
    l10n.voiceAndSpeech.missingVoiceTitle,
    l10n.voiceAndSpeech.missingVoiceMessage,
    [
      {text: l10n.common.cancel, style: 'cancel'},
      {
        text: l10n.voiceAndSpeech.openVoiceSettings,
        onPress: () => {
          ttsStore.openVoiceSettings().catch(() => {});
        },
      },
    ],
  );
};
