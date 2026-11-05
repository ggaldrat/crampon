import {makeAutoObservable, runInAction, when} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

import {chatSessionStore} from './ChatSessionStore';
import {devReportStore} from './DevReportStore';
import {modelStore} from './ModelStore';
import {uiStore} from './UIStore';

import {Model, ModelOrigin} from '../utils/types';

/**
 * Crampon: keeps the installed model equal to the first recommendation of the
 * device's tier (online rules, refreshed at each launch). The newer model is
 * downloaded silently in the background, swapped in when no conversation is
 * open (launch or new chat), checked with a tiny completion, and only then is
 * the previous one deleted. A model that fails to load or answer is not
 * retried until the app itself updates (a newer engine may read it), and the
 * previous one stays; a failed download is retried at the next launch.
 */
export class ModelUpdateStore {
  /** User switch in Settings. */
  enabled = true;
  /** Models that failed to load or answer: retried after an app update. */
  failedIds: string[] = [];
  /** App build that recorded failedIds. */
  failedBuild: string | null = null;
  /** Model being downloaded or waiting to be swapped in (hidden from the UI). */
  pendingId: string | null = null;

  private running = false;

  constructor() {
    makeAutoObservable(this, {}, {autoBind: true});
    makePersistable(this, {
      name: 'ModelUpdateStore',
      properties: ['enabled', 'failedIds', 'failedBuild', 'pendingId'],
      storage: AsyncStorage,
    }).then(() => {
      if (this.failedBuild !== DeviceInfo.getBuildNumber()) {
        runInAction(() => {
          this.failedIds = [];
        });
      }
      when(
        () =>
          modelStore.rulesSettled &&
          modelStore.launchReloadSettled &&
          uiStore.hasCompletedOnboarding,
        () => this.run(),
      );
    });
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    if (value) {
      this.run();
    }
  }

  /** The model chat uses: loaded now, or the one reloaded at next launch. */
  private get currentModel(): Model | undefined {
    return modelStore.activeModel ?? modelStore.lastUsedModel;
  }

  /**
   * First preset of the tier when it differs from the current model. Only
   * from the online rules: when the fetch fails (slow network), the bundled
   * PocketPal floor ranks other models first and must not trigger a swap.
   */
  get target(): Model | undefined {
    const current = this.currentModel;
    const target = modelStore.models.find(
      m => m.id === modelStore.tierPresetIds[0],
    );
    if (
      !this.enabled ||
      !modelStore.rulesFetched ||
      !current ||
      !target ||
      target.id === current.id ||
      current.origin === ModelOrigin.REMOTE ||
      this.failedIds.includes(target.id)
    ) {
      return undefined;
    }
    return target;
  }

  async run(): Promise<void> {
    const target = this.target;
    if (this.running || !target) {
      return;
    }
    this.running = true;
    runInAction(() => {
      this.pendingId = target.id;
    });
    devReportStore.report('model_update_found', {
      from: this.currentModel?.id,
      to: target.id,
      rulesVersion: modelStore.rulesVersion,
      tier: modelStore.deviceTier,
    });
    try {
      if (!(await this.download(target))) {
        devReportStore.report('model_update_download_failed', {to: target.id});
        return;
      }
      // Never swap under an open conversation or a running generation.
      await when(
        () =>
          chatSessionStore.activeSessionId === null &&
          !chatSessionStore.isGenerating &&
          !modelStore.isGenerationBusy,
      );
      if (this.target?.id === target.id) {
        await this.swap(target);
      }
    } finally {
      runInAction(() => {
        this.pendingId = null;
        this.running = false;
      });
    }
  }

  private async download(target: Model): Promise<boolean> {
    if (!target.isDownloaded) {
      try {
        if (!modelStore.isDownloading(target.id)) {
          await modelStore.checkSpaceAndDownload(target.id);
        }
        await when(
          () =>
            !!modelStore.models.find(m => m.id === target.id)?.isDownloaded ||
            modelStore.downloadError?.metadata?.modelId === target.id,
        );
      } catch {
        // reported below through isDownloaded
      }
    }
    if (modelStore.models.find(m => m.id === target.id)?.isDownloaded) {
      return true;
    }
    // Network or storage trouble: silent, retried at next launch.
    if (modelStore.downloadError?.metadata?.modelId === target.id) {
      modelStore.clearDownloadError();
    }
    return false;
  }

  private async swap(target: Model): Promise<void> {
    const previous = this.currentModel;
    const result = await this.loadAndCheck(target);
    devReportStore.report('model_update_swap', {
      from: previous?.id,
      to: target.id,
      result,
    });
    if (result === 'replaced') {
      // Something else loaded a model meanwhile: not the target's fault, so
      // keep both files and try again at the next launch.
      return;
    }
    if (result === 'ok') {
      if (previous && previous.origin !== ModelOrigin.LOCAL) {
        await modelStore.deleteModel(previous).catch(() => {});
      }
      return;
    }
    // Silent failure: hide the load error, go back to the previous model.
    modelStore.clearModelLoadError();
    this.markFailed(target.id);
    if (previous) {
      await modelStore.selectModel(previous).catch(() => {});
    }
    await modelStore.deleteModel(target).catch(() => {});
  }

  /** Load the model and have it produce a few tokens. */
  private async loadAndCheck(
    target: Model,
  ): Promise<'ok' | 'failed' | 'replaced'> {
    try {
      await modelStore.selectModel(target);
    } catch {
      return 'failed';
    }
    if (modelStore.activeModelId !== target.id) {
      return 'replaced';
    }
    try {
      const lease = await modelStore.acquireGeneration();
      if (!lease) {
        return 'failed';
      }
      try {
        const result = await lease.engine.completion({
          messages: [{role: 'user', content: 'Bonjour'}],
          n_predict: 8,
          enable_thinking: false,
        });
        return result.text?.trim() || result.content?.trim() ? 'ok' : 'failed';
      } finally {
        lease.end();
      }
    } catch {
      return 'failed';
    }
  }

  private markFailed(id: string) {
    this.failedBuild = DeviceInfo.getBuildNumber();
    if (!this.failedIds.includes(id)) {
      this.failedIds.push(id);
    }
  }
}

export const modelUpdateStore = new ModelUpdateStore();
