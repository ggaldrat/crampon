import * as React from 'react';
import {TextInput, TextInputProps, View, Animated} from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import {observer} from 'mobx-react';
import {IconButton, Text} from 'react-native-paper';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

import {chatSessionStore, modelStore} from '../../store';

import {MessageType} from '../../utils/types';
import {L10nContext, UserContext} from '../../utils';

import {SendButton, StopButton, VoiceChip} from '..';

export interface ChatInputTopLevelProps {
  /** Whether the AI is currently streaming tokens */
  isStreaming?: boolean;
  /** Will be called on {@link SendButton} tap. Has {@link MessageType.PartialText} which can
   * be transformed to {@link MessageType.Text} and added to the messages list. */
  onSendPress: (message: MessageType.PartialText) => void;
  onStopPress?: () => void;
  onCancelEdit?: () => void;
  isStopVisible?: boolean;
  /** Controls the visibility behavior of the {@link SendButton} based on the
   * `TextInput` state. Defaults to `editing`. */
  sendButtonVisibilityMode?: 'always' | 'editing';
  textInputProps?: TextInputProps;
}

export type ChatInputProps = ChatInputTopLevelProps;

const hapticOptions = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

/** Bottom bar input component with a text input, attachment and
 * send buttons inside. By default hides send button when text input is empty. */
export const ChatInput = observer(
  ({
    isStreaming = false,
    onSendPress,
    onStopPress,
    onCancelEdit,
    isStopVisible,
    sendButtonVisibilityMode,
    textInputProps,
  }: ChatInputProps) => {
    const l10n = React.useContext(L10nContext);
    const theme = useTheme();
    const user = React.useContext(UserContext);
    const inputRef = React.useRef<TextInput>(null);
    const editBarHeight = React.useRef(new Animated.Value(0)).current;

    const hasActiveModel = !!modelStore.activeModelId;

    // Use `defaultValue` if provided
    const [text, setText] = React.useState(textInputProps?.defaultValue ?? '');
    // State for showing "model not loaded" helper text
    const [showModelWarning, setShowModelWarning] = React.useState(false);
    const isEditMode = chatSessionStore.isEditMode;
    const isStopping = chatSessionStore.isStopping;

    const styles = createStyles({theme});

    const value = textInputProps?.value ?? text;

    React.useEffect(() => {
      if (isEditMode) {
        // Animate edit bar height
        Animated.spring(editBarHeight, {
          toValue: 28,
          useNativeDriver: false,
          friction: 8,
        }).start();
        // Focus input
        inputRef.current?.focus();
      } else {
        Animated.spring(editBarHeight, {
          toValue: 0,
          useNativeDriver: false,
          friction: 8,
        }).start();
        onCancelEdit?.();
      }
    }, [isEditMode, editBarHeight, onCancelEdit]);

    const handleChangeText = (newText: string) => {
      setText(newText);
      textInputProps?.onChangeText?.(newText);
    };

    const handleSend = () => {
      const trimmedValue = value.trim();
      if (trimmedValue) {
        // Check if model is loaded before sending
        if (!hasActiveModel) {
          // Trigger haptic feedback to indicate the action is blocked
          ReactNativeHapticFeedback.trigger(
            'notificationWarning',
            hapticOptions,
          );
          // Show warning helper text
          setShowModelWarning(true);
          // Auto-hide after 3 seconds
          setTimeout(() => setShowModelWarning(false), 3000);
          return;
        }

        onSendPress({text: trimmedValue, type: 'text'});
        setText('');
      }
    };

    const handleCancel = () => {
      setText('');
      onCancelEdit?.();
    };

    const isSendButtonVisible =
      !isStreaming &&
      !isStopVisible &&
      user &&
      (sendButtonVisibilityMode === 'always' || value.trim());
    const isSendButtonEnabled =
      value.trim().length > 0 && hasActiveModel && !isStopping;
    const sendButtonOpacity = isSendButtonEnabled ? 1 : 0.4;

    const onSurfaceColor = theme.colors.text;
    const onSurfaceColorVariant = onSurfaceColor + '55'; // for disabled state or placeholder text

    return (
      <View style={styles.container}>
        <View style={styles.inputContainer}>
          {/* Edit Bar (when in edit mode) */}
          {isEditMode && (
            <Animated.View
              style={[
                styles.editBar,
                {
                  height: editBarHeight,
                },
              ]}>
              <Text variant="labelSmall" style={styles.editBarText}>
                Editing message
              </Text>
              <IconButton
                icon="close"
                size={16}
                onPress={handleCancel}
                style={styles.editBarButton}
                iconColor={theme.colors.onSurfaceVariant}
              />
            </Animated.View>
          )}

          {/* Text Input Area (Top Row) */}
          <View
            style={[
              styles.textInputArea,
              {
                paddingTop: isEditMode
                  ? 48 // Edit bar height (28px) + normal padding (20px)
                  : 20,
              },
            ]}>
            <TextInput
              ref={inputRef}
              multiline
              placeholder={l10n.components.chatInput.inputPlaceholder}
              placeholderTextColor={onSurfaceColorVariant}
              underlineColorAndroid="transparent"
              {...textInputProps}
              style={[
                styles.input,
                textInputProps?.style,
                {
                  color: onSurfaceColor,
                },
              ]}
              onChangeText={handleChangeText}
              value={value}
              editable={textInputProps?.editable !== false}
              testID="chat-input"
              accessibilityLabel="Message input"
            />
          </View>

          {/* Control Bar (Bottom Row) */}
          <View style={styles.controlBar}>
            {/* Right Controls */}
            <View style={styles.rightControls}>
              {/* Helper text for model not loaded */}
              {showModelWarning && !hasActiveModel && (
                <View style={styles.helperTextContainer}>
                  <Text variant="bodySmall" style={styles.helperText}>
                    {l10n.chat.cannotSendWithoutModel}
                  </Text>
                </View>
              )}

              {/* Voice chip (TTS) — always present so users can stop
                  audio independently of text generation. Self-gates:
                  returns null when TTS is unavailable. */}
              <VoiceChip />

              {/* Send/Stop Button */}
              {isStopVisible ? (
                <StopButton color={onSurfaceColor} onPress={onStopPress} />
              ) : (
                isSendButtonVisible && (
                  <View style={{opacity: sendButtonOpacity}}>
                    <SendButton
                      color={onSurfaceColor}
                      onPress={handleSend}
                      touchableOpacityProps={{
                        disabled: isStopping,
                        accessibilityState: {disabled: isStopping},
                      }}
                    />
                  </View>
                )
              )}
            </View>
          </View>
        </View>
      </View>
    );
  },
);
