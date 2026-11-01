import {StyleSheet} from 'react-native';

import {Theme} from '../../utils/types';

// Speaker pill (toggle auto-speak / stop playback). Dimmed and transparent
// when auto-speak is OFF so it doesn't compete visually with send.
export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    pillContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 32,
      borderRadius: 16,
      overflow: 'hidden',
    },
    pillContainerActive: {
      backgroundColor: theme.colors.surfaceVariant,
    },
    pillSpeakerHalf: {
      width: 38,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconDimmed: {
      opacity: 0.5,
    },
  });
