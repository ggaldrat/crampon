import React from 'react';
import {View, Text} from 'react-native';

import {useTheme} from '../../../../hooks';
import {createStyles} from './styles';

export type ItalicAccentTitleProps = {
  /** Full title string — may contain `\n` for forced line breaks. */
  title: string;
  /**
   * Substring rendered in Fraunces-Italic. When omitted the entire
   * title renders italic.
   */
  accent?: string;
  align?: 'left' | 'center';
};

/**
 * Splits a title string into a plain run and a Fraunces-italic accent
 * run. `title` may contain `\n` — each line renders as its own Text so
 * they center independently of each other's widths.
 */
export const ItalicAccentTitle: React.FC<ItalicAccentTitleProps> = ({
  title,
  accent,
  align = 'center',
}) => {
  const theme = useTheme();
  const styles = createStyles(theme, align);
  const lines = title.split('\n');

  return (
    <View>
      {lines.map((line, i) => {
        if (!accent || !line.includes(accent)) {
          return (
            <Text key={i} style={[styles.line, styles.plain]}>
              {line}
            </Text>
          );
        }
        const idx = line.indexOf(accent);
        const before = line.slice(0, idx);
        const after = line.slice(idx + accent.length);
        return (
          <Text key={i} style={styles.line}>
            {before ? <Text style={styles.plain}>{before}</Text> : null}
            <Text style={styles.accent}>{accent}</Text>
            {after ? <Text style={styles.plain}>{after}</Text> : null}
          </Text>
        );
      })}
    </View>
  );
};
