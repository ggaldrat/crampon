import React from 'react';
import {Alert} from 'react-native';

import {render, fireEvent} from '../../../../jest/test-utils';

import {HeaderRight} from '../HeaderRight';

import {chatSessionStore, modelStore, uiStore} from '../../../store';
import {defaultCompletionSettings} from '../../../store/ChatSessionStore';
import {L10nContext} from '../../../utils';
import {modelsList} from '../../../../jest/fixtures/models';
import {l10n} from '../../../locales';

jest.mock('../../UsageStats', () => ({
  UsageStats: jest.fn(() => {
    const {View} = require('react-native');
    return <View testID="usage-stats" />;
  }),
}));

const renderWithI18n = (ui: React.ReactElement) => {
  return render(
    <L10nContext.Provider value={l10n.en as any}>{ui}</L10nContext.Provider>,
  );
};

describe('HeaderRight', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chatSessionStore.sessions = [];
    chatSessionStore.activeSessionId = null;
  });

  it('renders without UsageStats when displayMemUsage is false', () => {
    uiStore.displayMemUsage = false;
    const {queryByTestId} = renderWithI18n(<HeaderRight />);
    expect(queryByTestId('usage-stats')).toBeNull();
    expect(queryByTestId('reset-button')).toBeTruthy();
    // No session yet: nothing to act on, so no menu
    expect(queryByTestId('menu-button')).toBeNull();
  });

  it('renders UsageStats when displayMemUsage is true', () => {
    uiStore.displayMemUsage = true;
    const {queryByTestId} = renderWithI18n(<HeaderRight />);
    expect(queryByTestId('usage-stats')).toBeTruthy();
    expect(queryByTestId('reset-button')).toBeTruthy();
  });

  it('calls resetActiveSession when reset button is pressed', () => {
    const {queryByTestId} = renderWithI18n(<HeaderRight />);
    const resetButton = queryByTestId('reset-button');
    expect(resetButton).toBeTruthy();
    if (resetButton) {
      fireEvent.press(resetButton);
    }
    expect(chatSessionStore.resetActiveSession).toHaveBeenCalled();
  });

  describe('Menu functionality', () => {
    describe('with active session', () => {
      beforeEach(() => {
        chatSessionStore.sessions = [
          {
            id: 'test-session',
            title: 'Test Session',
            date: new Date().toISOString(),
            messages: [],
            completionSettings: defaultCompletionSettings,
            settingsSource: 'pal',
          },
        ];
        chatSessionStore.activeSessionId = 'test-session';
        // Set up the mock model store
        modelStore.models = [modelsList[0]];
        modelStore.activeModelId = modelsList[0].id;
        jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
      });

      afterEach(() => {
        jest.restoreAllMocks();
      });

      it('shows only the session actions', async () => {
        const {getByTestId, findByText, queryByText} = renderWithI18n(
          <HeaderRight />,
        );
        const menuButton = getByTestId('menu-button');
        fireEvent.press(menuButton);

        expect(getByTestId('menu-view')).toBeTruthy();
        for (const removed of [
          'Generation settings',
          'Model',
          'Export/Import',
        ]) {
          expect(queryByText(removed)).toBeNull();
        }
        expect(
          await findByText(l10n.en.components.headerRight.duplicateChatHistory),
        ).toBeTruthy();
        expect(await findByText(l10n.en.common.rename)).toBeTruthy();
        expect(await findByText(l10n.en.common.delete)).toBeTruthy();
      });

      it('handles delete action with confirmation', async () => {
        const {getByTestId, findByText} = renderWithI18n(<HeaderRight />);
        const menuButton = getByTestId('menu-button');
        fireEvent.press(menuButton);

        const deleteButton = await findByText('Delete');
        fireEvent.press(deleteButton);

        // Verify Alert was shown with correct options
        expect(Alert.alert).toHaveBeenCalledWith(
          'Delete Chat',
          'Are you sure you want to delete this chat?',
          expect.arrayContaining([
            expect.objectContaining({text: 'Cancel'}),
            expect.objectContaining({
              text: 'Delete',
              style: 'destructive',
              onPress: expect.any(Function),
            }),
          ]),
        );

        // Get the delete callback and call it
        const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
        const deleteCallback = alertCall[2].find(
          (button: any) => button.text === 'Delete',
        ).onPress;
        deleteCallback();

        // Verify the delete actions were called
        expect(chatSessionStore.resetActiveSession).toHaveBeenCalled();
        expect(chatSessionStore.deleteSession).toHaveBeenCalledWith(
          'test-session',
        );
      });

      it('handles duplicate action', async () => {
        const {getByTestId, findByText} = renderWithI18n(<HeaderRight />);
        const menuButton = getByTestId('menu-button');
        fireEvent.press(menuButton);

        const duplicateButton = await findByText('Duplicate chat history');
        fireEvent.press(duplicateButton);

        expect(chatSessionStore.duplicateSession).toHaveBeenCalledWith(
          'test-session',
        );
      });
    });
  });
});
