import React from 'react';
import {View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {useTheme} from '../../../../hooks';
import {createStyles} from './styles';

export type OnboardingScaffoldProps = {
  /** 1-based screen index used for the testID. */
  step: 6;
  /**
   * Hero visual block rendered above `content`, centered in the body's
   * vertical free space.
   */
  illustration?: React.ReactNode;
  /** `content` slot — title + body, centered as a single block. */
  content: React.ReactNode;
  layout?: 'centered' | 'top';
};

/**
 * Single-screen onboarding scaffold — no chrome, no bottom bar, no
 * back/skip affordance. Just an illustration + content block, centered.
 */
export const OnboardingScaffold: React.FC<OnboardingScaffoldProps> = ({
  step,
  illustration,
  content,
  layout = 'centered',
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <SafeAreaView
      testID={`onboarding-screen-${step}`}
      style={styles.root}
      edges={['top', 'bottom']}>
      <View
        style={[
          styles.body,
          layout === 'centered' ? styles.bodyCentered : null,
        ]}>
        {illustration}
        {content}
      </View>
    </SafeAreaView>
  );
};
