import {StyleSheet} from 'react-native';

import type {Theme} from '../../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      alignItems: 'center',
      gap: theme.spacing.m,
    },
    eyebrow: {
      ...theme.typography.captionM,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
    },
    bodyWrap: {
      alignItems: 'center',
    },
  });
