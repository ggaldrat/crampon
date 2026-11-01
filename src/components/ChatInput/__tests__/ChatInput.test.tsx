import {fireEvent, waitFor} from '@testing-library/react-native';
import * as React from 'react';
import {ScrollView, Alert} from 'react-native';
import {runInAction} from 'mobx';

import {user} from '../../../../jest/fixtures';
import {l10n} from '../../../locales';
import {UserContext} from '../../../utils';
import {ChatInput} from '../ChatInput';
import {render} from '../../../../jest/test-utils';
import {chatSessionStore, modelStore} from '../../../store';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

jest.spyOn(Alert, 'alert');

const renderScrollable = () => <ScrollView />;

describe('input', () => {
  it('send button', () => {
    expect.assertions(2);
    // Set up an active model for the test
    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
    });
    const onSendPress = jest.fn();
    const {getByPlaceholderText, getByLabelText} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            sendButtonVisibilityMode: 'editing',
            textInputProps: {value: 'text'},
          }}
        />
      </UserContext.Provider>,
    );
    const textInput = getByPlaceholderText(
      l10n.en.components.chatInput.inputPlaceholder,
    );
    fireEvent.changeText(textInput, 'text');
    const button = getByLabelText(
      l10n.en.components.sendButton.accessibilityLabel,
    );
    fireEvent.press(button);
    expect(onSendPress).toHaveBeenCalledWith({text: 'text', type: 'text'});
    expect(textInput.props).toHaveProperty('value', 'text');
  });

  it('sends a text message', () => {
    expect.assertions(2);
    // Set up an active model for the test
    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
    });
    const onSendPress = jest.fn();
    const {getByPlaceholderText, getByLabelText} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            renderScrollable,
            sendButtonVisibilityMode: 'editing',
          }}
        />
      </UserContext.Provider>,
    );
    const textInput = getByPlaceholderText(
      l10n.en.components.chatInput.inputPlaceholder,
    );
    fireEvent.changeText(textInput, 'text');
    const button = getByLabelText(
      l10n.en.components.sendButton.accessibilityLabel,
    );
    fireEvent.press(button);
    expect(onSendPress).toHaveBeenCalledWith({text: 'text', type: 'text'});
    expect(textInput.props).toHaveProperty('value', '');
  });

  describe('while a send waits for a stopped run to drain', () => {
    beforeEach(() => {
      runInAction(() => {
        modelStore.activeModelId = 'test-model-id';
      });
      chatSessionStore.isStopping = true;
    });

    afterEach(() => {
      chatSessionStore.isStopping = false;
    });

    it('disables Send, announced as disabled, and keeps the typed text', () => {
      const onSendPress = jest.fn();
      const {getByPlaceholderText, getByLabelText} = render(
        <UserContext.Provider value={user}>
          <ChatInput
            {...{
              onSendPress,
              renderScrollable,
              sendButtonVisibilityMode: 'editing',
            }}
          />
        </UserContext.Provider>,
      );
      const textInput = getByPlaceholderText(
        l10n.en.components.chatInput.inputPlaceholder,
      );
      fireEvent.changeText(textInput, 'second message');
      const button = getByLabelText(
        l10n.en.components.sendButton.accessibilityLabel,
      );

      expect(button.props.accessibilityState).toEqual(
        expect.objectContaining({disabled: true}),
      );
      fireEvent.press(button);
      expect(onSendPress).not.toHaveBeenCalled();
      expect(textInput.props.value).toBe('second message');
    });
  });

  it('sends a text message if onChangeText and value are provided', () => {
    expect.assertions(2);
    // Set up an active model for the test
    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
    });
    const onSendPress = jest.fn();
    const value = 'value';
    const onChangeText = jest.fn(newValue => {
      rerender(
        <UserContext.Provider value={user}>
          <ChatInput
            {...{
              onSendPress,
              renderScrollable,
              sendButtonVisibilityMode: 'editing',
              textInputProps: {onChangeText, value: newValue},
            }}
          />
        </UserContext.Provider>,
      );
    });
    const {getByPlaceholderText, getByLabelText, rerender} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            renderScrollable,
            sendButtonVisibilityMode: 'editing',
            textInputProps: {onChangeText, value},
          }}
        />
      </UserContext.Provider>,
    );
    const textInput = getByPlaceholderText(
      l10n.en.components.chatInput.inputPlaceholder,
    );
    fireEvent.changeText(textInput, 'text');
    const button = getByLabelText(
      l10n.en.components.sendButton.accessibilityLabel,
    );
    fireEvent.press(button);
    expect(onSendPress).toHaveBeenCalledWith({text: 'text', type: 'text'});
    expect(textInput.props).toHaveProperty('value', 'text');
  });

  it('sends a text message if onChangeText is provided', () => {
    expect.assertions(2);
    // Set up an active model for the test
    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
    });
    const onSendPress = jest.fn();
    const onChangeText = jest.fn();
    const {getByPlaceholderText, getByLabelText} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            renderScrollable,
            sendButtonVisibilityMode: 'editing',
            textInputProps: {onChangeText},
          }}
        />
      </UserContext.Provider>,
    );
    const textInput = getByPlaceholderText(
      l10n.en.components.chatInput.inputPlaceholder,
    );
    fireEvent.changeText(textInput, 'text');
    const button = getByLabelText(
      l10n.en.components.sendButton.accessibilityLabel,
    );
    fireEvent.press(button);
    expect(onSendPress).toHaveBeenCalledWith({text: 'text', type: 'text'});
    expect(textInput.props).toHaveProperty('value', '');
  });

  it('sends a text message if value is provided', async () => {
    expect.assertions(2);
    // Set up an active model for the test
    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
    });
    const onSendPress = jest.fn();
    const value = 'value';
    const {getByPlaceholderText, getByLabelText} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            renderScrollable,
            sendButtonVisibilityMode: 'editing',
            textInputProps: {value},
          }}
        />
      </UserContext.Provider>,
    );
    const textInput = getByPlaceholderText(
      l10n.en.components.chatInput.inputPlaceholder,
    );
    await waitFor(() => fireEvent.changeText(textInput, 'text')); // Wait for the input to update

    const button = getByLabelText(
      l10n.en.components.sendButton.accessibilityLabel,
    );
    await waitFor(() => fireEvent.press(button)); // Wait for the press event to be processed

    expect(onSendPress).toHaveBeenCalledWith({text: value, type: 'text'});
    expect(textInput.props).toHaveProperty('value', value);
  });

  it('sends a text message if defaultValue is provided', () => {
    expect.assertions(2);
    // Set up an active model for the test
    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
    });
    const onSendPress = jest.fn();
    const defaultValue = 'defaultValue';
    const {getByPlaceholderText, getByLabelText} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            renderScrollable,
            sendButtonVisibilityMode: 'editing',
            textInputProps: {defaultValue},
          }}
        />
      </UserContext.Provider>,
    );
    const textInput = getByPlaceholderText(
      l10n.en.components.chatInput.inputPlaceholder,
    );
    const button = getByLabelText(
      l10n.en.components.sendButton.accessibilityLabel,
    );
    fireEvent.press(button);
    expect(onSendPress).toHaveBeenCalledWith({
      text: defaultValue,
      type: 'text',
    });
    expect(textInput.props).toHaveProperty('value', '');
  });

  it('shows stop button when isStopVisible is true', () => {
    expect.assertions(1);
    const onStopPress = jest.fn();
    const onSendPress = jest.fn();
    const {getByTestId} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            onStopPress,
            isStopVisible: true,
            sendButtonVisibilityMode: 'editing',
          }}
        />
      </UserContext.Provider>,
    );
    const stopButton = getByTestId('stop-button');
    fireEvent.press(stopButton);
    expect(onStopPress).toHaveBeenCalledTimes(1);
  });

  it('shows send button with always visibility mode', () => {
    expect.assertions(1);
    const onSendPress = jest.fn();
    const {getByLabelText} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          {...{
            onSendPress,
            sendButtonVisibilityMode: 'always',
          }}
        />
      </UserContext.Provider>,
    );

    const sendButton = getByLabelText(
      l10n.en.components.sendButton.accessibilityLabel,
    );
    expect(sendButton).toBeTruthy();
  });

  describe('Edit Mode Functionality', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('shows edit bar when in edit mode', () => {
      runInAction(() => {
        chatSessionStore.isEditMode = true;
      });
      const onSendPress = jest.fn();
      const onCancelEdit = jest.fn();

      render(
        <UserContext.Provider value={user}>
          <ChatInput
            {...{
              onSendPress,
              onCancelEdit,
              sendButtonVisibilityMode: 'editing',
            }}
          />
        </UserContext.Provider>,
      );

      expect(onCancelEdit).not.toHaveBeenCalled(); // Should not be called on render
    });

    it('calls onCancelEdit when cancel button is pressed', () => {
      const onSendPress = jest.fn();
      const onCancelEdit = jest.fn();

      // Start with edit mode enabled
      runInAction(() => {
        chatSessionStore.isEditMode = true;
      });

      const {getByTestId} = render(
        <UserContext.Provider value={user}>
          <ChatInput
            {...{
              onSendPress,
              onCancelEdit,
              sendButtonVisibilityMode: 'editing',
            }}
          />
        </UserContext.Provider>,
      );

      // Find and press the cancel button in the edit bar
      const cancelButton = getByTestId('icon-button');
      fireEvent.press(cancelButton);

      expect(onCancelEdit).toHaveBeenCalledTimes(1);
    });
  });

  describe('Model Not Loaded Feedback', () => {
    it('shows warning and haptic feedback when trying to send without model', async () => {
      // Mock haptic feedback
      const hapticTriggerSpy = jest.spyOn(ReactNativeHapticFeedback, 'trigger');

      // Ensure no model is loaded
      runInAction(() => {
        modelStore.activeModelId = undefined;
        modelStore.context = undefined;
      });

      const onSendPress = jest.fn();

      const {getByPlaceholderText, getByLabelText, getByText} = render(
        <UserContext.Provider value={user}>
          <ChatInput
            {...{
              onSendPress,
              renderScrollable,
              sendButtonVisibilityMode: 'editing',
            }}
          />
        </UserContext.Provider>,
      );

      const input = getByPlaceholderText(
        l10n.en.components.chatInput.inputPlaceholder,
      );
      fireEvent.changeText(input, 'Test message');

      const sendButton = getByLabelText(
        l10n.en.components.sendButton.accessibilityLabel,
      );
      fireEvent.press(sendButton);

      // Verify haptic feedback was triggered
      expect(hapticTriggerSpy).toHaveBeenCalledWith('notificationWarning', {
        enableVibrateFallback: true,
        ignoreAndroidSystemSettings: false,
      });

      // Verify helper text is displayed
      expect(getByText(l10n.en.chat.cannotSendWithoutModel)).toBeTruthy();

      // Verify onSendPress was NOT called
      expect(onSendPress).not.toHaveBeenCalled();

      hapticTriggerSpy.mockRestore();
    });

    it('allows sending when model is loaded', async () => {
      const onSendPress = jest.fn();

      // Ensure model is loaded
      runInAction(() => {
        modelStore.activeModelId = 'test-model';
        modelStore.context = {id: 'test-context'} as any;
      });

      const {getByPlaceholderText, getByLabelText} = render(
        <UserContext.Provider value={user}>
          <ChatInput
            {...{
              onSendPress,
              renderScrollable,
              sendButtonVisibilityMode: 'editing',
            }}
          />
        </UserContext.Provider>,
      );

      const input = getByPlaceholderText(
        l10n.en.components.chatInput.inputPlaceholder,
      );
      fireEvent.changeText(input, 'Test message');

      const sendButton = getByLabelText(
        l10n.en.components.sendButton.accessibilityLabel,
      );
      fireEvent.press(sendButton);

      // Verify onSendPress WAS called
      expect(onSendPress).toHaveBeenCalledWith({
        text: 'Test message',
        type: 'text',
        imageUris: undefined,
      });
    });
  });
});
