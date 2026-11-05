import {observable, runInAction} from 'mobx';

const mockModelStore: any = observable(
  {
    models: [] as any[],
    trialCandidateIds: [] as string[],
    activeModelId: undefined as string | undefined,
    downloadError: null as any,
    isGenerationBusy: false,
    get activeModel() {
      return this.models.find((m: any) => m.id === this.activeModelId);
    },
    lastUsedModel: undefined as any,
    isDownloading: jest.fn(() => false),
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
const mockRunTrial = jest.fn();

jest.mock('../ModelStore', () => ({modelStore: mockModelStore}));
jest.mock('../ChatSessionStore', () => ({
  chatSessionStore: mockChatSessionStore,
}));
jest.mock('../../services/modelTrial/runTrial', () => ({
  ...jest.requireActual('../../services/modelTrial/runTrial'),
  runTrial: (...args: unknown[]) => mockRunTrial(...args),
}));

const {ModelTrialStore} = require('../ModelTrialStore');
const {devReportStore} = require('../DevReportStore');
const {TrialInterrupted} = jest.requireActual(
  '../../services/modelTrial/runTrial',
);

const SMALL = 'org/small/small.gguf';
const FAST = 'org/fast/fast.gguf';
const SLOW = 'org/slow/slow.gguf';

const measures = (score: number, decodeTps: number, promptTps = 40) => ({
  decodeTps,
  promptTps,
  score,
  total: 12,
  answers: [{id: 'capitale', ok: true, answer: 'Canberra'}],
  ms: 1000,
});

describe('ModelTrialStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      mockModelStore.models = [
        {id: SMALL, origin: 'hf', isDownloaded: true},
        {id: FAST, origin: 'hf', isDownloaded: false},
        {id: SLOW, origin: 'hf', isDownloaded: false},
      ];
      mockModelStore.trialCandidateIds = [SMALL, FAST, SLOW];
      mockModelStore.activeModelId = SMALL;
      mockChatSessionStore.activeSessionId = null;
    });
    mockModelStore.checkSpaceAndDownload.mockImplementation(
      async (id: string) => {
        runInAction(() => {
          mockModelStore.models.find((m: any) => m.id === id).isDownloaded =
            true;
        });
      },
    );
    mockModelStore.selectModel.mockImplementation(async (m: any) => {
      runInAction(() => {
        mockModelStore.activeModelId = m.id;
      });
    });
    mockModelStore.acquireGeneration.mockResolvedValue({
      engine: {},
      end: jest.fn(),
    });
    mockModelStore.deleteModel.mockResolvedValue(undefined);
    mockRunTrial.mockImplementation(async () => {
      const id = mockModelStore.activeModelId;
      return id === SMALL
        ? measures(5, 16)
        : id === FAST
          ? measures(9, 8)
          : measures(11, 3); // the best answers, but too slow here
    });
  });

  it('tries each candidate, keeps the best one fast enough, removes the others', async () => {
    const store = new ModelTrialStore();
    await store.run();

    expect(store.settled).toBe(true);
    expect(store.choice).toBe(FAST);
    // the model in use comes back after each trial
    expect(mockModelStore.activeModelId).toBe(SMALL);
    // downloaded for the trial and not chosen
    expect(mockModelStore.deleteModel).toHaveBeenCalledTimes(1);
    expect(mockModelStore.deleteModel).toHaveBeenCalledWith(
      expect.objectContaining({id: SLOW}),
    );
    expect(devReportStore.report).toHaveBeenCalledWith(
      'model_trial',
      expect.objectContaining({model: FAST, score: 9, decodeTps: 8}),
    );
    expect(devReportStore.report).toHaveBeenCalledWith(
      'model_trial_choice',
      expect.objectContaining({choice: FAST}),
    );

    // tried once: a later run does nothing
    mockRunTrial.mockClear();
    await store.run();
    expect(mockRunTrial).not.toHaveBeenCalled();
  });

  it('waits for the conversation to close, and stops when the user comes back', async () => {
    runInAction(() => {
      mockChatSessionStore.activeSessionId = 'session-1';
    });
    mockRunTrial.mockRejectedValueOnce(new TrialInterrupted());
    const store = new ModelTrialStore();
    const done = store.run();
    await new Promise(resolve => setImmediate(resolve));
    expect(mockRunTrial).not.toHaveBeenCalled();

    runInAction(() => {
      mockChatSessionStore.activeSessionId = null;
    });
    await done;
    // interrupted on the first candidate: nothing recorded, the model is back
    expect(store.results).toEqual({});
    expect(store.settled).toBe(false);
    expect(mockModelStore.activeModelId).toBe(SMALL);
  });

  it('gives up a candidate whose download keeps failing', async () => {
    mockModelStore.checkSpaceAndDownload.mockImplementation(
      async (id: string) => {
        if (id !== FAST) {
          return;
        }
        runInAction(() => {
          mockModelStore.downloadError = {metadata: {modelId: id}};
        });
      },
    );
    mockModelStore.clearDownloadError.mockImplementation(() => {
      runInAction(() => {
        mockModelStore.downloadError = null;
      });
    });
    runInAction(() => {
      mockModelStore.trialCandidateIds = [SMALL, FAST];
    });
    const store = new ModelTrialStore();
    await store.run();
    await store.run();
    expect(store.settled).toBe(false);
    await store.run();
    expect(store.settled).toBe(true);
    expect(store.results[FAST].loaded).toBe(false);
    expect(store.choice).toBe(SMALL);
  });
});
