import React, {useContext} from 'react';
import {Pressable, View} from 'react-native';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import {ttsStore} from '../../store';
import {L10nContext} from '../../utils';
import {StopIcon, VolumeOnIcon, VolumeMinIcon} from '../../assets/icons';

import {createStyles} from './styles';
import {promptMissingVoice} from './promptMissingVoice';

const pickSpeakerIcon = (autoSpeakEnabled: boolean, isPlaying: boolean) => {
  if (isPlaying) {
    return StopIcon;
  }
  return autoSpeakEnabled ? VolumeOnIcon : VolumeMinIcon;
};

/**
 * Compact voice control: toggles reading answers aloud, or stops playback.
 * The voice itself is picked automatically (see TTSStore.refreshAutoVoice);
 * with no offline voice on the phone, the button explains how to install
 * one. Hidden entirely when TTS is unavailable.
 */
export const VoiceChip: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  const autoSpeakEnabled = ttsStore.autoSpeakEnabled;
  const playbackState = ttsStore.playbackState;
  const isPlaying =
    playbackState.mode === 'playing' || playbackState.mode === 'streaming';
  const hasVoice = ttsStore.currentVoice != null;

  if (!ttsStore.isTTSAvailable) {
    return null;
  }

  const handleSpeakerPress = () => {
    if (!hasVoice) {
      promptMissingVoice(l10n);
      return;
    }
    if (isPlaying) {
      ttsStore.stop().catch(() => {});
      return;
    }
    ttsStore.setAutoSpeak(!autoSpeakEnabled);
  };

  const CurrentSpeakerIcon = pickSpeakerIcon(autoSpeakEnabled, isPlaying);
  const active = autoSpeakEnabled || isPlaying;

  return (
    <View
      style={[styles.pillContainer, active && styles.pillContainerActive]}
      testID="voicechip">
      <Pressable
        style={styles.pillSpeakerHalf}
        onPress={handleSpeakerPress}
        accessibilityRole="button"
        accessibilityLabel={
          isPlaying
            ? l10n.voiceAndSpeech.stopMessageLabel
            : l10n.voiceAndSpeech.toggleAutoSpeakLabel
        }
        accessibilityState={
          hasVoice && !isPlaying ? {selected: autoSpeakEnabled} : undefined
        }
        testID="voicechip-speaker">
        <View style={!active && styles.iconDimmed}>
          <CurrentSpeakerIcon
            width={18}
            height={18}
            stroke={
              isPlaying ? theme.colors.primary : theme.colors.onSurfaceVariant
            }
          />
        </View>
      </Pressable>
    </View>
  );
});
