import {AppState} from 'react-native';
import {observable, runInAction} from 'mobx';

const mockModelStore: any = observable({
  isGenerationBusy: false,
  activeDownloads: [] as any[],
});
const mockChatSessionStore: any = observable({
  activeSessionId: null as string | null,
  isGenerating: false,
});
const mockModelUpdateStore: any = observable({
  enabled: true,
  pendingId: null as string | null,
});
const mockUpdater = {
  getInfo: jest.fn(),
  install: jest.fn(),
  takeLastError: jest.fn(),
};
const mockFs = {
  CachesDirectoryPath: '/cache',
  exists: jest.fn(),
  hash: jest.fn(),
  unlink: jest.fn(),
  downloadFile: jest.fn(),
};

jest.mock('../ModelStore', () => ({modelStore: mockModelStore}));
jest.mock('../ChatSessionStore', () => ({
  chatSessionStore: mockChatSessionStore,
}));
jest.mock('../ModelUpdateStore', () => ({
  modelUpdateStore: mockModelUpdateStore,
}));
jest.mock('../UIStore', () => ({uiStore: {hasCompletedOnboarding: false}}));
jest.mock('../../specs/NativeAppUpdater', () => ({
  __esModule: true,
  default: mockUpdater,
}));
jest.mock('@dr.pogodin/react-native-fs', () => mockFs);

let mockSetAppState: (state: string) => void = () => {};
jest
  .spyOn(AppState, 'addEventListener')
  .mockImplementation((_type: any, listener: any) => {
    mockSetAppState = listener;
    return {remove: jest.fn()} as any;
  });

// Required after the mocks above exist (imports are hoisted).
const {AppUpdateStore, APP_MANIFEST_URLS} = require('../AppUpdateStore');

const HASH = 'abc123';
const manifest = (versionCode: number) => ({
  versionCode,
  url: 'https://crampon.blandy-studio.com/crampon.apk',
  sha256: HASH.toUpperCase(),
});
const flush = () => new Promise(resolve => setImmediate(resolve));

describe('AppUpdateStore', () => {
  let onDisk: string | null;

  beforeEach(() => {
    jest.clearAllMocks();
    onDisk = null;
    runInAction(() => {
      mockChatSessionStore.activeSessionId = null;
      mockModelUpdateStore.enabled = true;
    });
    mockUpdater.getInfo.mockResolvedValue({
      versionCode: 100,
      selfInstalled: true,
    });
    mockUpdater.takeLastError.mockResolvedValue(null);
    mockUpdater.install.mockResolvedValue('committed');
    mockFs.exists.mockImplementation(async () => onDisk !== null);
    mockFs.hash.mockImplementation(async () => onDisk);
    mockFs.unlink.mockImplementation(async () => {
      onDisk = null;
    });
    mockFs.downloadFile.mockImplementation(() => {
      onDisk = HASH;
      return {promise: Promise.resolve({statusCode: 200})};
    });
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => manifest(200),
    });
  });

  it('installs a newer version once the app goes to the background', async () => {
    const store = new AppUpdateStore();
    store.appState = 'active';
    const done = store.run();
    await flush();
    for (const url of APP_MANIFEST_URLS) {
      expect(global.fetch).toHaveBeenCalledWith(url, expect.anything());
    }
    expect(mockFs.downloadFile).toHaveBeenCalled();
    expect(mockUpdater.install).not.toHaveBeenCalled();

    mockSetAppState('background');
    await done;
    expect(mockUpdater.install).toHaveBeenCalledWith(
      '/cache/crampon-update.apk',
    );
    expect(store.installingVersion).toBe(200);
  });

  it('asks Android once, while the app is open on an empty screen', async () => {
    mockUpdater.getInfo.mockResolvedValue({
      versionCode: 100,
      selfInstalled: false,
    });
    runInAction(() => {
      mockChatSessionStore.activeSessionId = 'session-1';
    });
    const store = new AppUpdateStore();
    store.appState = 'active';
    const done = store.run();
    await flush();
    expect(mockUpdater.install).not.toHaveBeenCalled();

    runInAction(() => {
      mockChatSessionStore.activeSessionId = null;
    });
    await done;
    expect(mockUpdater.install).toHaveBeenCalled();
  });

  it('takes the newest version among the sources, ignoring one that fails', async () => {
    (global as any).fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ok: true, json: async () => manifest(300)});
    const store = new AppUpdateStore();
    store.appState = 'background';
    await store.run();
    expect(store.installingVersion).toBe(300);
  });

  it('does nothing when up to date or switched off', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => manifest(100),
    });
    const store = new AppUpdateStore();
    await store.run();
    runInAction(() => {
      mockModelUpdateStore.enabled = false;
    });
    await store.run();
    expect(mockFs.downloadFile).not.toHaveBeenCalled();
    expect(mockUpdater.install).not.toHaveBeenCalled();
  });

  it('throws away a download whose hash does not match', async () => {
    mockFs.downloadFile.mockImplementation(() => {
      onDisk = 'corrupted';
      return {promise: Promise.resolve({statusCode: 200})};
    });
    const store = new AppUpdateStore();
    await store.run();
    expect(mockFs.unlink).toHaveBeenCalled();
    expect(onDisk).toBeNull();
    expect(mockUpdater.install).not.toHaveBeenCalled();
  });

  it('never retries a version Android refused to install', async () => {
    mockUpdater.takeLastError.mockResolvedValue('status 1: conflict');
    const store = new AppUpdateStore();
    store.installingVersion = 200;
    await store.run();
    expect(store.failedVersions).toEqual([200]);
    expect(store.installingVersion).toBeNull();
    expect(mockFs.downloadFile).not.toHaveBeenCalled();
  });

  it('retries after a dismissed confirmation', async () => {
    const store = new AppUpdateStore();
    store.installingVersion = 200;
    store.appState = 'background';
    await store.run();
    expect(store.failedVersions).toEqual([]);
    expect(mockUpdater.install).toHaveBeenCalled();
  });
});
