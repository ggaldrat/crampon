import {StyleSheet} from 'react-native';

import type {Theme} from '../../../utils/types';

export const createStyles = (theme: Theme) =>
  StyleSheet.create({
    statusWrap: {
      width: 260,
      alignItems: 'center',
      gap: theme.spacing.m,
    },
    status: {
      ...theme.typography.bodyS,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
    },
    progressBar: {
      width: '100%',
      height: 6,
      borderRadius: 3,
    },
  });
