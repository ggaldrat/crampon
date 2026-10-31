import {StyleSheet} from 'react-native';

import type {Theme} from '../../../../utils/types';

export const createStyles = (_theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
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
