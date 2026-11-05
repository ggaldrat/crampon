import {AppState, Platform} from 'react-native';
import {makeAutoObservable, runInAction, when} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as RNFS from '@dr.pogodin/react-native-fs';
import DeviceInfo from 'react-native-device-info';

import NativeHardwareInfo from '../specs/NativeHardwareInfo';
import {runVeille} from '../services/veille';
import type {Catalogue} from '../services/veille/catalogue';

import {devReportStore} from './DevReportStore';
import {uiStore} from './UIStore';

const CATALOGUE_PATH = `${RNFS.DocumentDirectoryPath}/veille-catalogue.json`;
const DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 60 * 60 * 1000;
const CHECK_EVERY_MS = 15 * 60 * 1000;

/**
 * Crampon: the model watch run by the phone itself, once a day, on Wi-Fi and
 * while charging, and compared with the reference published on GitHub (see
 * services/veille). For now the result only goes to the development reports,
 * whose switch also turns the watch off: the rules still come from the
 * reference.
 */
export class VeilleStore {
  /** No run before this time (ms): a day after a success, an hour after a failure. */
  nextRunAfter = 0;
  running = false;

  constructor() {
    makeAutoObservable(this, {}, {autoBind: true});
    makePersistable(this, {
      name: 'VeilleStore',
      properties: ['nextRunAfter'],
      storage: AsyncStorage,
    }).then(() => {
      when(
        () => uiStore.hasCompletedOnboarding,
        () => {
          this.maybeRun();
          setInterval(this.maybeRun, CHECK_EVERY_MS);
          AppState.addEventListener('change', state => {
            if (state === 'active') {
              this.maybeRun();
            }
          });
        },
      );
    });
  }

  async maybeRun() {
    if (
      Platform.OS !== 'android' ||
      this.running ||
      !devReportStore.enabled ||
      Date.now() < this.nextRunAfter
    ) {
      return;
    }
    const [charging, unmetered] = await Promise.all([
      DeviceInfo.isBatteryCharging().catch(() => false),
      NativeHardwareInfo.isNetworkUnmetered?.().catch(() => false) ?? false,
    ]);
    if (charging && unmetered && !this.running) {
      await this.run();
    }
  }

  async run() {
    this.running = true;
    const start = Date.now();
    try {
      const catalogue = await loadCatalogue();
      const result = await runVeille(catalogue);
      await RNFS.writeFile(CATALOGUE_PATH, JSON.stringify(catalogue), 'utf8');
      // the comparison only: the gaps already carry the differing lists
      const {rules, ...summary} = result;
      devReportStore.report('veille', {
        ...summary,
        tiers: Object.keys(rules.tiers ?? {}).length,
        ms: Date.now() - start,
      });
      runInAction(() => {
        this.nextRunAfter = Date.now() + DAY_MS;
      });
    } catch (error) {
      devReportStore.reportError('veille_error', error, {
        ms: Date.now() - start,
      });
      runInAction(() => {
        this.nextRunAfter = Date.now() + RETRY_MS;
      });
    } finally {
      runInAction(() => {
        this.running = false;
      });
    }
  }
}

const loadCatalogue = async (): Promise<Catalogue> => {
  try {
    return JSON.parse(await RNFS.readFile(CATALOGUE_PATH, 'utf8'));
  } catch {
    // First run, or a corrupt file: the catalogue starts over.
    return {};
  }
};

export const veilleStore = new VeilleStore();
