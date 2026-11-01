import React from 'react';
import {runInAction} from 'mobx';

import {fireEvent, render, waitFor} from '../../../../../jest/test-utils';

import {L10nContext} from '../../../../utils';
import {l10n} from '../../../../locales';
import {uiStore, modelStore, palStore} from '../../../../store';
import {TOPIC_TO_PAL} from '../../../../store/onboarding/onboardingPals';
import type {Model} from '../../../../utils/types';

import {Onboarding6Screen} from '../Onboarding6Screen';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: () => true,
  }),
}));

const renderScreen = () =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <Onboarding6Screen />
    </L10nContext.Provider>,
  );

describe('Onboarding6Screen (single full-screen auto-setup, no pal, no chrome)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      // There is no topic picker; selectedTopic stays null for the life
      // of the app. The screen always resolves the `else` tier list
      // (PAL_PIP's `.models`) regardless of this value.
      uiStore.onboardingState = {
        selectedTopic: null,
        selectedModelId: null,
      };
      modelStore.models = [] as Model[];
      modelStore.tierPresetIds = [];
      modelStore.rulesSettled = true;
    });
    palStore.pals = [];

    // registerOnboardingPalModel materialises the picked entry into
    // modelStore.models (mirrors addHFModel's real side effect), so the
    // screen's `when(() => model.isDownloaded)` wait has something to
    // observe.
    (modelStore.registerOnboardingPalModel as jest.Mock).mockImplementation(
      async (entry: {
        repo: string;
        filename: string;
        displayName: string;
        sizeBytes: number;
        params: number;
      }) => {
        const model = {
          id: `${entry.repo}/${entry.filename}`,
          name: entry.displayName,
          size: entry.sizeBytes,
          params: entry.params,
          origin: 'HF',
          isDownloaded: false,
          progress: 0,
        } as unknown as Model;
        runInAction(() => {
          modelStore.models.push(model);
        });
        return model;
      },
    );

    // Real startDownload resolves once the native download is *queued*,
    // not once the file is on disk — mirror that by flipping
    // isDownloaded asynchronously (next microtask), same as
    // DownloadManager's onComplete callback would.
    (modelStore.checkSpaceAndDownload as jest.Mock).mockImplementation(
      async (modelId: string) => {
        queueMicrotask(() => {
          runInAction(() => {
            const model = modelStore.models.find(m => m.id === modelId);
            if (model) {
              model.isDownloaded = true;
              model.progress = 100;
            }
          });
        });
      },
    );
  });

  it('auto-registers the recommended entry (else/Pip tier list) and starts the download without any tap', async () => {
    const recommended = TOPIC_TO_PAL.else.models.find(m => m.recommended)!;

    renderScreen();

    await waitFor(() => {
      expect(modelStore.registerOnboardingPalModel).toHaveBeenCalledWith(
        recommended,
      );
      expect(modelStore.checkSpaceAndDownload).toHaveBeenCalled();
    });
  });

  it("installs the device tier's first rule preset instead of the hardcoded entry when one resolved", async () => {
    const preset = {
      id: 'LiquidAI/LFM2.5-2.6B-GGUF/LFM2.5-2.6B-Q4_K_M.gguf',
      name: 'LFM2.5 2.6B',
      origin: 'HF',
      isRulePreset: true,
      isDownloaded: false,
      progress: 0,
    } as unknown as Model;
    runInAction(() => {
      modelStore.models.push(preset);
      modelStore.tierPresetIds = [preset.id, 'other/repo/file.gguf'];
    });

    renderScreen();

    await waitFor(() => {
      expect(uiStore.completeOnboarding).toHaveBeenCalledWith({
        topic: null,
        modelId: preset.id,
      });
    });
    expect(modelStore.registerOnboardingPalModel).not.toHaveBeenCalled();
    expect(modelStore.checkSpaceAndDownload).toHaveBeenCalledWith(preset.id);
  });

  it('never creates or touches a pal — the model is bound directly, no persona', async () => {
    renderScreen();

    await waitFor(() => {
      expect(uiStore.completeOnboarding).toHaveBeenCalled();
    });
    expect(palStore.createPal).not.toHaveBeenCalled();
    expect(palStore.updatePal).not.toHaveBeenCalled();
    expect(palStore.pals).toHaveLength(0);
  });

  it('loads the model into memory (selectModel) before completing onboarding, not just downloads it', async () => {
    renderScreen();

    await waitFor(() => {
      expect(uiStore.completeOnboarding).toHaveBeenCalled();
    });
    const [args] = (uiStore.completeOnboarding as jest.Mock).mock.calls[0];
    expect(args.modelId).toEqual(expect.any(String));
    const model = modelStore.models.find(m => m.id === args.modelId);
    expect(model?.isDownloaded).toBe(true);
    expect(modelStore.selectModel).toHaveBeenCalledTimes(1);
    const [selected] = (modelStore.selectModel as jest.Mock).mock.calls[0];
    expect(selected.id).toBe(args.modelId);
  });

  it('shows the error dialog on an immediate start failure and retries on tap', async () => {
    (modelStore.checkSpaceAndDownload as jest.Mock).mockRejectedValueOnce(
      new Error('network down'),
    );

    const {getByText} = renderScreen();

    await waitFor(() => {
      expect(modelStore.checkSpaceAndDownload).toHaveBeenCalledTimes(1);
    });
    // DownloadErrorDialog renders a Try Again action once visible=true.
    await waitFor(() => {
      expect(
        getByText(l10n.en.components.downloadErrorDialog.tryAgain),
      ).toBeTruthy();
    });

    fireEvent.press(getByText(l10n.en.components.downloadErrorDialog.tryAgain));

    await waitFor(() => {
      expect(modelStore.checkSpaceAndDownload).toHaveBeenCalledTimes(2);
      expect(uiStore.completeOnboarding).toHaveBeenCalled();
    });
  });

  it('shows the error dialog when the background download fails after starting', async () => {
    (modelStore.checkSpaceAndDownload as jest.Mock).mockImplementationOnce(
      async (modelId: string) => {
        queueMicrotask(() => {
          runInAction(() => {
            modelStore.downloadError = {
              code: 'network',
              message: 'connection lost',
              context: 'download',
              recoverable: true,
              metadata: {modelId},
            } as any;
          });
        });
      },
    );

    const {getByText} = renderScreen();

    await waitFor(() => {
      expect(
        getByText(l10n.en.components.downloadErrorDialog.tryAgain),
      ).toBeTruthy();
    });
    expect(uiStore.completeOnboarding).not.toHaveBeenCalled();
  });
});
