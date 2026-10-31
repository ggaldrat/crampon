import {StyleSheet} from 'react-native';

import type {Theme} from '../../../../utils/types';

export const createStyles = (theme: Theme, align: 'left' | 'center') =>
  StyleSheet.create({
    line: {
      textAlign: align,
    },
    plain: {
      ...theme.typography.headlineH1,
      color: theme.colors.onBackground,
    },
    accent: {
      ...theme.typography.styledXs,
      fontSize: theme.typography.headlineH1.fontSize,
      lineHeight: theme.typography.headlineH1.lineHeight,
      color: theme.colors.onBackground,
    },
  });
