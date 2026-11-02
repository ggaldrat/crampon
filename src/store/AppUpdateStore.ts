import {AppState} from 'react-native';
import {makeAutoObservable, runInAction, when} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as RNFS from '@dr.pogodin/react-native-fs';

import NativeAppUpdater from '../specs/NativeAppUpdater';

import {chatSessionStore} from './ChatSessionStore';
import {modelStore} from './ModelStore';
import {modelUpdateStore} from './ModelUpdateStore';
import {uiStore} from './UIStore';

export const APP_MANIFEST_URL =
  'https://crampon.blandy-studio.com/version.json';

/** Published next to the APK by doc/deploy_apk.sh. */
export type AppManifest = {
  versionCode: number;
  url: string;
  sha256: string;
};

const APK_PATH = `${RNFS.CachesDirectoryPath}/crampon-update.apk`;

/**
 * Crampon: keeps the app itself (and so the inference engine bundled in it)
 * up to date, like ModelUpdateStore does for the model, under the same
 * Settings switch. The newer APK is downloaded silently and checked against
 * its SHA-256. Once Crampon has installed one update itself it is its own
 * installer of record, and Android applies the next ones without asking: they
 * are installed when the app goes to the background, idle. Until then, the
 * one-time Android confirmation is shown while the app is open and idle.
 * A version Android refused to install is never retried.
 */
export class AppUpdateStore {
  /** Version handed to Android, checked at the next launch. */
  installingVersion: number | null = null;
  /** Versions Android refused to install: never retried. */
  failedVersions: number[] = [];

  appState = AppState.currentState;
  private running = false;

  constructor() {
    makeAutoObservable(this, {}, {autoBind: true});
    AppState.addEventListener('change', state => {
      runInAction(() => {
        this.appState = state;
      });
    });
    makePersistable(this, {
      name: 'AppUpdateStore',
      properties: ['installingVersion', 'failedVersions'],
      storage: AsyncStorage,
    }).then(() => {
      when(
        () => uiStore.hasCompletedOnboarding,
        () => this.run(),
      );
    });
  }

  /** Nothing is running that an app restart would interrupt. */
  get idle(): boolean {
    return (
      !chatSessionStore.isGenerating &&
      !modelStore.isGenerationBusy &&
      modelStore.activeDownloads.length === 0 &&
      modelUpdateStore.pendingId === null
    );
  }

  async run(): Promise<void> {
    if (!NativeAppUpdater || !modelUpdateStore.enabled || this.running) {
      return;
    }
    this.running = true;
    try {
      const info = await NativeAppUpdater.getInfo();
      await this.checkLastInstall(info.versionCode);

      const manifest = await this.fetchManifest();
      if (
        !manifest ||
        manifest.versionCode <= info.versionCode ||
        this.failedVersions.includes(manifest.versionCode)
      ) {
        return;
      }
      if (!(await this.download(manifest))) {
        return;
      }

      if (info.selfInstalled) {
        await when(() => this.appState === 'background' && this.idle);
      } else {
        // Android asks once: only while the app is open on an empty screen.
        await when(
          () =>
            this.appState === 'active' &&
            chatSessionStore.activeSessionId === null &&
            this.idle,
        );
      }
      runInAction(() => {
        this.installingVersion = manifest.versionCode;
      });
      await NativeAppUpdater.install(APK_PATH);
    } catch (error) {
      console.warn('AppUpdateStore: update failed', error);
    } finally {
      runInAction(() => {
        this.running = false;
      });
    }
  }

  /** Tells whether the version handed to Android last time got installed. */
  private async checkLastInstall(versionCode: number): Promise<void> {
    const error = await NativeAppUpdater!.takeLastError();
    const tried = this.installingVersion;
    if (tried === null) {
      return;
    }
    if (versionCode >= tried) {
      await RNFS.unlink(APK_PATH).catch(() => {});
    } else if (error) {
      // Refused by Android (not just a dismissed confirmation): give up on it.
      console.warn('AppUpdateStore: install refused', error);
      runInAction(() => {
        this.failedVersions.push(tried);
      });
      await RNFS.unlink(APK_PATH).catch(() => {});
    }
    runInAction(() => {
      this.installingVersion = null;
    });
  }

  private async fetchManifest(): Promise<AppManifest | null> {
    const response = await fetch(APP_MANIFEST_URL, {
      headers: {'Cache-Control': 'no-cache'},
    });
    if (!response.ok) {
      return null;
    }
    const manifest = await response.json();
    return typeof manifest?.versionCode === 'number' &&
      typeof manifest?.url === 'string' &&
      typeof manifest?.sha256 === 'string'
      ? manifest
      : null;
  }

  /** Downloads the APK unless already there; true once its hash matches. */
  private async download(manifest: AppManifest): Promise<boolean> {
    const matches = async () =>
      (await RNFS.exists(APK_PATH)) &&
      (await RNFS.hash(APK_PATH, 'sha256')) === manifest.sha256.toLowerCase();

    if (await matches()) {
      return true;
    }
    const {promise} = RNFS.downloadFile({
      fromUrl: manifest.url,
      toFile: APK_PATH,
    });
    const result = await promise;
    if (result.statusCode === 200 && (await matches())) {
      return true;
    }
    // Corrupted or interrupted: start over at the next launch.
    await RNFS.unlink(APK_PATH).catch(() => {});
    return false;
  }
}

export const appUpdateStore = new AppUpdateStore();
