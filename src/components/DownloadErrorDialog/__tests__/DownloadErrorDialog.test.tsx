import React from 'react';
import {fireEvent} from '@testing-library/react-native';
import {render} from '../../../../jest/test-utils';
import {DownloadErrorDialog} from '../DownloadErrorDialog';
import {Linking} from 'react-native';
import {createModel} from '../../../../jest/fixtures/models';
import {l10n} from '../../../locales';
import {createErrorState, ErrorState} from '../../../utils/errors';

// Mock Linking - need to spy on the actual Linking object
const mockOpenURL = jest.fn().mockImplementation(() => Promise.resolve());
jest.spyOn(Linking, 'openURL').mockImplementation(mockOpenURL);

describe('DownloadErrorDialog', () => {
  const mockDismiss = jest.fn();
  const mockTryAgain = jest.fn();
  const mockModel = createModel({
    id: 'test-model',
    name: 'Test Model',
    hfUrl: 'https://huggingface.co/test/test-model',
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when not visible', () => {
    const {queryByText} = render(
      <DownloadErrorDialog
        visible={false}
        onDismiss={mockDismiss}
        error={null}
      />,
    );

    expect(queryByText('Download Failed')).toBeNull();
  });

  it.each(['401', '403'])(
    'renders a restricted-model error for HTTP %s without a retry',
    code => {
      const error: ErrorState = createErrorState(
        new Error(`Client error: ${code}`),
        'download',
        'huggingface',
        {
          modelId: 'test-model',
        },
      );

      const {getByText, queryByText} = render(
        <DownloadErrorDialog
          visible={true}
          onDismiss={mockDismiss}
          error={error}
          model={mockModel}
          onTryAgain={mockTryAgain}
        />,
      );

      const alerts = l10n.en.components.downloadErrorDialog;
      expect(getByText(alerts.restrictedTitle)).toBeTruthy();
      expect(getByText(alerts.restrictedMessage)).toBeTruthy();
      expect(queryByText(alerts.tryAgain)).toBeNull();

      fireEvent.press(getByText(alerts.viewOnHuggingFace));
      expect(Linking.openURL).toHaveBeenCalledWith(
        'https://huggingface.co/test/test-model',
      );

      fireEvent.press(getByText(l10n.en.common.dismiss));
      expect(mockDismiss).toHaveBeenCalled();
    },
  );

  it('renders generic download error when error type is unknown', () => {
    const error: ErrorState = createErrorState(
      new Error('Something unexpected happened'),
      'download',
      'huggingface',
      {
        modelId: 'test-model',
      },
    );

    const {getByText, getByTestId} = render(
      <DownloadErrorDialog
        visible={true}
        onDismiss={mockDismiss}
        error={error}
        model={mockModel}
        onTryAgain={mockTryAgain}
      />,
    );

    // Check that the generic error title is displayed
    expect(
      getByText(l10n.en.components.downloadErrorDialog.downloadFailedTitle),
    ).toBeTruthy();

    // Check that the error message is displayed using testID
    expect(getByTestId('error-message-text')).toBeTruthy();
    expect(getByTestId('error-message-text').props.children).toBe(
      'Something unexpected happened',
    );
  });
});
