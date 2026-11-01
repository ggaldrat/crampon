import React from 'react';
import {Alert} from 'react-native';
import {runInAction} from 'mobx';

import {fireEvent, render} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {ttsStore} from '../../../store';

import {VoiceChip} from '../VoiceChip';

const renderChip = () =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <VoiceChip />
    </L10nContext.Provider>,
  );

const systemVoice = {
  id: 'v1',
  name: 'Alexandra',
  engine: 'system' as const,
};

describe('VoiceChip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    runInAction(() => {
      ttsStore.userTTSOverride = null;
      ttsStore.currentVoice = systemVoice;
      ttsStore.autoSpeakEnabled = false;
      ttsStore.playbackState = {mode: 'idle'};
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders nothing when the user turned TTS off', () => {
    runInAction(() => {
      ttsStore.userTTSOverride = false;
    });
    const {queryByTestId} = renderChip();
    expect(queryByTestId('voicechip')).toBeNull();
  });

  it('shows a single speaker button, no voice settings entry', () => {
    const {getByTestId, queryByTestId} = renderChip();
    expect(getByTestId('voicechip-speaker')).toBeTruthy();
    expect(queryByTestId('voicechip-secondary')).toBeNull();
  });

  it('turns reading aloud on', () => {
    const {getByTestId} = renderChip();
    fireEvent.press(getByTestId('voicechip-speaker'));
    expect(ttsStore.setAutoSpeak).toHaveBeenCalledWith(true);
  });

  it('turns reading aloud off', () => {
    runInAction(() => {
      ttsStore.autoSpeakEnabled = true;
    });
    const {getByTestId} = renderChip();
    fireEvent.press(getByTestId('voicechip-speaker'));
    expect(ttsStore.setAutoSpeak).toHaveBeenCalledWith(false);
  });

  it('stops playback while speaking', () => {
    runInAction(() => {
      ttsStore.playbackState = {mode: 'playing', messageId: 'm1'};
    });
    const {getByTestId} = renderChip();
    fireEvent.press(getByTestId('voicechip-speaker'));
    expect(ttsStore.stop).toHaveBeenCalled();
    expect(ttsStore.setAutoSpeak).not.toHaveBeenCalled();
  });

  it('explains how to install a voice when the phone has none', () => {
    runInAction(() => {
      ttsStore.currentVoice = null;
    });
    const {getByTestId} = renderChip();
    fireEvent.press(getByTestId('voicechip-speaker'));
    expect(Alert.alert).toHaveBeenCalledWith(
      l10n.en.voiceAndSpeech.missingVoiceTitle,
      l10n.en.voiceAndSpeech.missingVoiceMessage,
      expect.any(Array),
    );
    expect(ttsStore.setAutoSpeak).not.toHaveBeenCalled();

    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    buttons[1].onPress();
    expect(ttsStore.openVoiceSettings).toHaveBeenCalled();
  });

  it('speaker accessibilityState reflects autoSpeakEnabled', () => {
    runInAction(() => {
      ttsStore.autoSpeakEnabled = true;
    });
    const {getByTestId} = renderChip();
    const speaker = getByTestId('voicechip-speaker');
    expect(speaker.props.accessibilityState).toEqual({selected: true});
  });
});
