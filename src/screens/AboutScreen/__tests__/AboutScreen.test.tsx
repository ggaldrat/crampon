import React from 'react';
import {Alert, Linking, Platform} from 'react-native';
import {render as baseRender, fireEvent} from '../../../../jest/test-utils';
import {AboutScreen} from '../AboutScreen';
import {l10n} from '../../../locales';

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {withBottomSheetProvider: true, ...options});

// Mock DeviceInfo
jest.mock('react-native-device-info', () => ({
  getVersion: jest.fn().mockReturnValue('1.0.0'),
  getBuildNumber: jest.fn().mockReturnValue('100'),
}));

// Mock Clipboard
jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
}));

// Mock Linking - need to spy on the actual Linking object
const mockOpenURL = jest.fn().mockImplementation(() => Promise.resolve());
jest.spyOn(Linking, 'openURL').mockImplementation(mockOpenURL);

jest.spyOn(Alert, 'alert');

describe('AboutScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    const {getByText} = render(<AboutScreen />);

    expect(getByText('Crampon')).toBeTruthy();
    expect(getByText('v1.0.0 (100)')).toBeTruthy();
    expect(getByText(l10n.en.about.basedOn)).toBeTruthy();
  });

  it('copies version to clipboard when version button is pressed', () => {
    const {getByText} = render(<AboutScreen />);

    fireEvent.press(getByText('v1.0.0 (100)'));

    expect(Alert.alert).toHaveBeenCalledWith(
      l10n.en.about.versionCopiedTitle,
      l10n.en.about.versionCopiedDescription,
    );
  });

  it.each([
    [l10n.en.about.sourceButton, 'https://github.com/ggaldrat/crampon'],
    [
      l10n.en.about.pocketpalButton,
      'https://github.com/a-ghorbani/pocketpal-ai',
    ],
  ])('opens %s', (label, url) => {
    const {getByText} = render(<AboutScreen />);

    fireEvent.press(getByText(label));

    expect(Linking.openURL).toHaveBeenCalledWith(url);
  });

  describe.each(['android', 'ios'] as const)('on %s', os => {
    const originalOS = Platform.OS;

    beforeEach(() => {
      Platform.OS = os;
    });

    afterEach(() => {
      Platform.OS = originalOS;
    });

    it('shows no sponsorship option', () => {
      const {queryByText, getByText} = render(<AboutScreen />);

      expect(queryByText('Become a Sponsor')).toBeNull();
      expect(queryByText('or')).toBeNull();
      expect(getByText(l10n.en.about.sourceButton)).toBeTruthy();
      expect(queryByText(l10n.en.feedback.shareThoughtsButton)).toBeNull();
    });
  });
});
