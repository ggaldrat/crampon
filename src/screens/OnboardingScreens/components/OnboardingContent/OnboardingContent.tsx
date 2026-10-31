import React from 'react';
import {View} from 'react-native';
import {Text} from 'react-native-paper';

import {useTheme} from '../../../../hooks';
import {createStyles} from './styles';

export type OnboardingContentProps = {
  /** Small top eyebrow label. */
  eyebrow?: string;
  /** Main title — typically wrapped in `ItalicAccentTitle`. */
  title: React.ReactNode;
  /** Body copy — typically a `<Text>` tree. */
  body?: React.ReactNode;
};

/**
 * Eyebrow + title + body block, centered between the illustration and
 * the bottom of the onboarding screen.
 */
export const OnboardingContent: React.FC<OnboardingContentProps> = ({
  eyebrow,
  title,
  body,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.root}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      {title}
      {body ? <View style={styles.bodyWrap}>{body}</View> : null}
    </View>
  );
};
