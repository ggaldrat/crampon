import {StyleSheet} from 'react-native';

import type {Theme} from '../../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    // Explicit themed background: without it the navigator's light default
    // shows through, and dark-mode text (onBackground = white) is unreadable.
    root: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    body: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    bodyCentered: {
      justifyContent: 'center',
    },
  });
