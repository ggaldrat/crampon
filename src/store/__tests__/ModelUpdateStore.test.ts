import {observable, runInAction} from 'mobx';

const mockModelStore: any = observable(
  {
    models: [] as any[],
    tierPresetIds: [] as string[],
    rulesSettled: true,
    rulesFetched: true,
    launchReloadSettled: true,
    activeModelId: undefined as string | undefined,
    downloadError: null as any,
    isGenerationBusy: false,
    get activeModel() {
      return this.models.find((m: any) => m.id === this.activeModelId);
    },
    lastUsedModel: undefined as any,
    isDownloading: jest.fn(),
    checkSpaceAndDownload: jest.fn(),
    selectModel: jest.fn(),
    acquireGeneration: jest.fn(),
    deleteModel: jest.fn(),
    clearDownloadError: jest.fn(),
    clearModelLoadError: jest.fn(),
  },
  {
    isDownloading: false,
    checkSpaceAndDownload: false,
    selectModel: false,
    acquireGeneration: false,
    deleteModel: false,
    clearDownloadError: false,
    clearModelLoadError: false,
  },
);
const mockChatSessionStore: any = observable({
  activeSessionId: null as string | null,
  isGenerating: false,
});

jest.mock('../ModelStore', () => ({modelStore: mockModelStore}));
jest.mock('../ChatSessionStore', () => ({
  chatSessionStore: mockChatSessionStore,
}));
jest.mock('../UIStore', () => ({uiStore: {hasCompletedOnboarding: false}}));
// The phone's trial is tested in ModelTrialStore.test.ts: here it is over,
// without a choice, so the tier's first preset is the target.
const mockModelTrialStore: any = observable(
  {
    settled: true,
    choice: undefined as string | undefined,
    run: jest.fn(async () => {}),
  },
  {run: false},
);
jest.mock('../ModelTrialStore', () => ({
  modelTrialStore: mockModelTrialStore,
}));

// Required after the mocks above exist (imports are hoisted).
const {ModelUpdateStore} = require('../ModelUpdateStore');

const OLD = 'org/old/old.gguf';
const NEW = 'org/new/new.gguf';
const flush = () => new Promise(resolve => setImmediate(resolve));

const answer = (text: string) => ({
  engine: {completion: jest.fn().mockResolvedValue({text, content: text})},
  end: jest.fn(),
});

describe('ModelUpdateStore', () => {
  let downloading: boolean;

  beforeEach(() => {
    jest.clearAllMocks();
    downloading = false;
    runInAction(() => {
      mockModelStore.models = [
        {id: OLD, origin: 'preset', isDownloaded: true},
        {id: NEW, origin: 'preset', isDownloaded: false},
      ];
      mockModelStore.tierPresetIds = [NEW];
      mockModelStore.activeModelId = OLD;
      mockModelStore.downloadError = null;
      mockChatSessionStore.activeSessionId = null;
      mockModelTrialStore.settled = true;
      mockModelTrialStore.choice = undefined;
    });
    mockModelStore.isDownloading.mockImplementation(() => downloading);
    mockModelStore.checkSpaceAndDownload.mockImplementation(async () => {
      downloading = true;
    });
    mockModelStore.selectModel.mockImplementation(async (m: any) => {
      runInAction(() => {
        mockModelStore.activeModelId = m.id;
      });
    });
    mockModelStore.acquireGeneration.mockImplementation(async () =>
      answer('Salut !'),
    );
    mockModelStore.deleteModel.mockImplementation(async () => {});
    mockModelStore.clearDownloadError.mockImplementation(() => {});
    mockModelStore.clearModelLoadError.mockImplementation(() => {});
  });

  const finishDownload = () =>
    runInAction(() => {
      downloading = false;
      mockModelStore.models[1].isDownloaded = true;
    });

  it('downloads the new first preset, swaps it in, then deletes the old one', async () => {
    const store = new ModelUpdateStore();
    const done = store.run();
    await flush();
    expect(mockModelStore.checkSpaceAndDownload).toHaveBeenCalledWith(NEW);
    expect(store.pendingId).toBe(NEW);
    finishDownload();
    await done;

    expect(mockModelStore.selectModel).toHaveBeenCalledWith(
      expect.objectContaining({id: NEW}),
    );
    expect(mockModelStore.deleteModel).toHaveBeenCalledWith(
      expect.objectContaining({id: OLD}),
    );
    expect(store.pendingId).toBeNull();
    expect(store.failedIds).toEqual([]);
  });

  it("installs the phone's choice after its trial, not the tier's first preset", async () => {
    const CHOSEN = 'org/chosen/chosen.gguf';
    runInAction(() => {
      mockModelStore.models.push({
        id: CHOSEN,
        origin: 'preset',
        isDownloaded: true,
      });
      mockModelTrialStore.choice = CHOSEN;
    });
    const store = new ModelUpdateStore();
    await store.trialThenRun();
    expect(mockModelTrialStore.run).toHaveBeenCalled();
    expect(mockModelStore.selectModel).toHaveBeenCalledWith(
      expect.objectContaining({id: CHOSEN}),
    );

    // and nothing moves while the trial is not over
    runInAction(() => {
      mockModelTrialStore.choice = undefined;
      mockModelTrialStore.settled = false;
    });
    expect(store.target).toBeUndefined();
  });

  it('waits for the conversation to close before swapping', async () => {
    runInAction(() => {
      mockModelStore.models[1].isDownloaded = true;
      mockChatSessionStore.activeSessionId = 'session-1';
    });
    const store = new ModelUpdateStore();
    const done = store.run();
    await flush();
    expect(mockModelStore.selectModel).not.toHaveBeenCalled();

    runInAction(() => {
      mockChatSessionStore.activeSessionId = null;
    });
    await done;
    expect(mockModelStore.selectModel).toHaveBeenCalled();
  });

  it('keeps the old model and never retries a model that does not answer', async () => {
    runInAction(() => {
      mockModelStore.models[1].isDownloaded = true;
    });
    mockModelStore.acquireGeneration.mockImplementation(async () =>
      answer('  '),
    );
    const store = new ModelUpdateStore();
    await store.run();

    expect(store.failedIds).toEqual([NEW]);
    expect(mockModelStore.selectModel).toHaveBeenLastCalledWith(
      expect.objectContaining({id: OLD}),
    );
    expect(mockModelStore.deleteModel).toHaveBeenCalledWith(
      expect.objectContaining({id: NEW}),
    );
    expect(mockModelStore.deleteModel).not.toHaveBeenCalledWith(
      expect.objectContaining({id: OLD}),
    );
    expect(store.target).toBeUndefined();
  });

  it('keeps both models when another load replaces the target meanwhile', async () => {
    runInAction(() => {
      mockModelStore.models[1].isDownloaded = true;
    });
    // The launch reload of the old model wins the race.
    mockModelStore.selectModel.mockImplementation(async () => {
      runInAction(() => {
        mockModelStore.activeModelId = OLD;
      });
    });
    const store = new ModelUpdateStore();
    await store.run();

    expect(store.failedIds).toEqual([]);
    expect(mockModelStore.deleteModel).not.toHaveBeenCalled();
    expect(store.target?.id).toBe(NEW);
  });

  it('gives up silently on a download error, to retry at next launch', async () => {
    const store = new ModelUpdateStore();
    const done = store.run();
    await flush();
    runInAction(() => {
      downloading = false;
      mockModelStore.downloadError = {metadata: {modelId: NEW}};
    });
    await done;

    expect(mockModelStore.clearDownloadError).toHaveBeenCalled();
    expect(store.failedIds).toEqual([]);
    expect(store.target?.id).toBe(NEW);
    expect(mockModelStore.selectModel).not.toHaveBeenCalled();
  });

  it('does nothing when switched off or already up to date', async () => {
    const store = new ModelUpdateStore();
    store.enabled = false;
    await store.run();
    store.enabled = true;
    runInAction(() => {
      mockModelStore.tierPresetIds = [OLD];
    });
    await store.run();
    expect(mockModelStore.checkSpaceAndDownload).not.toHaveBeenCalled();
  });

  it('ignores the bundled floor when the online rules could not be read', async () => {
    runInAction(() => {
      mockModelStore.rulesFetched = false;
    });
    await new ModelUpdateStore().run();
    runInAction(() => {
      mockModelStore.rulesFetched = true;
    });
    expect(mockModelStore.checkSpaceAndDownload).not.toHaveBeenCalled();
  });
});
