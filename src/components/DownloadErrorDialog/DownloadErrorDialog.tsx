import React from 'react';
import {View, Linking} from 'react-native';
import {Text, Portal} from 'react-native-paper';

import {Dialog, DialogAction} from '../Dialog';
import {Model} from '../../utils/types';
import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {ErrorState} from '../../utils/errors';
import {createStyles} from './styles';

interface DownloadErrorDialogProps {
  visible: boolean;
  onDismiss: () => void;
  error: ErrorState | null;
  model?: Model;
  onTryAgain?: () => void;
}

export const DownloadErrorDialog: React.FC<DownloadErrorDialogProps> = ({
  visible,
  onDismiss,
  error,
  model,
  onTryAgain,
}) => {
  const theme = useTheme();
  const l10n = React.useContext(L10nContext);
  const alerts = l10n.components.downloadErrorDialog;

  const notEnoughSpace = error?.code === 'storage';

  // Without a Hugging Face account, gated or private repos cannot be fetched.
  const isRestricted =
    error?.code === 'authentication' ||
    error?.code === 'authorization' ||
    error?.code === 'server';

  const getDialogTitle = () =>
    isRestricted ? alerts.restrictedTitle : alerts.downloadFailedTitle;

  const getDialogMessage = () => {
    if (isRestricted) {
      return alerts.restrictedMessage;
    }
    return !error?.message
      ? t(alerts.downloadFailedMessage, {message: ''})
      : undefined;
  };

  const getActions = () => {
    const actions: DialogAction[] = [];

    if (model?.hfUrl && !notEnoughSpace) {
      actions.push({
        label: alerts.viewOnHuggingFace,
        onPress: () => {
          Linking.openURL(model.hfUrl);
        },
        mode: 'text' as const,
      });
    }

    if (isRestricted || notEnoughSpace) {
      actions.push({
        label: l10n.common.dismiss,
        onPress: () => {
          onDismiss();
        },
        mode: 'text' as const,
      });
    }

    if (!isRestricted && onTryAgain) {
      actions.push({
        label: alerts.tryAgain,
        onPress: onTryAgain,
        mode: 'contained' as const,
      });
    }

    return actions;
  };

  const message = getDialogMessage();
  const styles = createStyles(theme);

  return (
    <Portal>
      <Dialog
        testID="download-error-dialog"
        visible={visible}
        onDismiss={onDismiss}
        title={getDialogTitle()}
        actions={getActions()}
        scrollable={true}>
        <View>
          {message && <Text variant="bodyMedium">{message}</Text>}

          {!isRestricted && error?.message && (
            <View style={styles.errorDetails}>
              <Text style={styles.errorText} testID="error-message-text">
                {error.message}
              </Text>
            </View>
          )}
        </View>
      </Dialog>
    </Portal>
  );
};
