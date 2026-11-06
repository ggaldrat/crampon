import {AppState} from 'react-native';
import {makeAutoObservable, observable, runInAction, when} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import NativeModelTrialService from '../specs/NativeModelTrialService';
import {
  runTrial,
  TrialAnswer,
  TrialInterrupted,
} from '../services/modelTrial/runTrial';

import {chatSessionStore} from './ChatSessionStore';
import {devReportStore} from './DevReportStore';
import {ensureDownloaded} from './ensureDownloaded';
import {modelStore} from './ModelStore';

import {Model, ModelOrigin} from '../utils/types';

/** Below this, answers come slower than they are read. */
export const MIN_DECODE_TPS = 6;
/** Launches with a failed download before a candidate is given up. */
const MAX_DOWNLOAD_FAILURES = 3;
/** Below this, the app's usual prompt (about 400 tokens) takes over 20 s. */
export const MIN_PROMPT_TPS = 20;
/** Raised when the questions change: older results no longer count. */
export const TRIAL_VERSION = 2;

export type TrialResult = {
  loaded: boolean;
  decodeTps: number;
  promptTps: number;
  score: number;
  total: number;
  toolScore?: number;
  toolTotal?: number;
  at: string;
  version?: number;
};

/** Observed, so that waiting for idle notices the app going to the background. */
const appState = observable.box(AppState.currentState);

/** On a conversation, in the app: the user may send a message any time. */
const userInChat = () =>
  appState.get() === 'active' && chatSessionStore.activeSessionId !== null;

const idle = () =>
  !userInChat() &&
  !chatSessionStore.isGenerating &&
  !modelStore.isGenerationBusy;

/**
 * Crampon: before the app settles on a model, the phone tries the first
 * models of its tier and of the tier above (ModelStore.trialCandidateIds):
 * speed, then questions checked automatically (services/modelTrial). Each one
 * is downloaded, loaded while the user is not on a conversation, then the
 * previous model comes back. A foreground service keeps the trial going
 * screen off or in the background. The choice is the best score among the
 * models fast enough on this phone; ModelUpdateStore then installs it and
 * removes the others.
 */
export class ModelTrialStore {
  /** By model id; kept across launches, so a model is tried once. */
  results: Record<string, TrialResult> = {};
  /** Models downloaded only for a trial: removed once the choice is made. */
  downloadedForTrial: string[] = [];
  /** Failed downloads by model id: past MAX_DOWNLOAD_FAILURES, the model is skipped. */
  downloadFailures: Record<string, number> = {};
  running = false;

  constructor() {
    makeAutoObservable(this, {}, {autoBind: true});
    makePersistable(this, {
      name: 'ModelTrialStore',
      properties: ['results', 'downloadedForTrial', 'downloadFailures'],
      storage: AsyncStorage,
    });
    // back in the app: a trial cut short goes on without a restart
    AppState.addEventListener('change', state => {
      runInAction(() => appState.set(state));
      if (
        state === 'active' &&
        !this.running &&
        this.candidates.length &&
        !this.settled
      ) {
        onResume?.();
      }
    });
  }

  /** The result of the current questions; older ones are tried again. */
  private resultOf(id: string): TrialResult | undefined {
    const r = this.results[id];
    return r?.version === TRIAL_VERSION ? r : undefined;
  }

  get candidates(): string[] {
    return modelStore.trialCandidateIds;
  }

  /** Every candidate tried. */
  get settled(): boolean {
    return (
      this.candidates.length > 0 &&
      this.candidates.every(id => this.resultOf(id))
    );
  }

  /** The best model fast enough here; undefined until settled. */
  get choice(): string | undefined {
    if (!this.settled) {
      return undefined;
    }
    let best: string | undefined;
    for (const id of this.candidates) {
      const r = this.resultOf(id)!;
      if (
        !r.loaded ||
        r.decodeTps < MIN_DECODE_TPS ||
        r.promptTps < MIN_PROMPT_TPS
      ) {
        continue;
      }
      const b = best ? this.resultOf(best) : undefined;
      if (
        !b ||
        r.score > b.score ||
        (r.score === b.score && r.decodeTps > b.decodeTps)
      ) {
        best = id;
      }
    }
    return best;
  }

  /** Tries the candidates not tried yet, one at a time. */
  async run(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    const todo = () => this.candidates.filter(id => !this.resultOf(id));
    if (todo().length) {
      // the trial goes on screen off or in the background: the model stays
      // loaded and Android keeps the app running, a notification showing it
      modelStore.disableAutoRelease('model_trial');
    }
    try {
      for (const id of this.candidates) {
        if (this.resultOf(id)) {
          continue;
        }
        const model = modelStore.models.find(m => m.id === id);
        const done = this.candidates.length - todo().length;
        NativeModelTrialService?.start(
          `${model?.name ?? id} (${done + 1}/${this.candidates.length})`,
        );
        if (!model) {
          return;
        }
        let outcome = await this.tryModel(model);
        while (outcome === 'interrupted') {
          // the user is chatting: the same model again once they leave
          await when(idle);
          outcome = await this.tryModel(model);
        }
        if (!outcome) {
          return;
        }
      }
      if (this.settled) {
        devReportStore.report('model_trial_choice', {
          choice: this.choice,
          candidates: this.candidates,
        });
        await this.removeLosers();
      }
    } finally {
      NativeModelTrialService?.stop();
      modelStore.enableAutoRelease('model_trial');
      runInAction(() => {
        this.running = false;
      });
    }
  }

  /**
   * False when the trial must stop for now (a download failed, another model
   * got loaded); 'interrupted' when the user came back to a conversation.
   */
  private async tryModel(model: Model): Promise<boolean | 'interrupted'> {
    if (!model.isDownloaded) {
      if (!(await ensureDownloaded(model))) {
        const failures = (this.downloadFailures[model.id] ?? 0) + 1;
        runInAction(() => {
          this.downloadFailures[model.id] = failures;
        });
        devReportStore.report('model_trial_download_failed', {
          model: model.id,
          failures,
        });
        if (failures >= MAX_DOWNLOAD_FAILURES) {
          // a file that never comes must not hold the choice back
          this.record(model.id, {loaded: false}, []);
          return true;
        }
        return false;
      }
      runInAction(() => {
        this.downloadedForTrial.push(model.id);
      });
    }
    await when(idle);
    const previous = modelStore.activeModel ?? modelStore.lastUsedModel;
    try {
      try {
        await modelStore.selectModel(model);
      } catch {
        modelStore.clearModelLoadError();
        this.record(model.id, {loaded: false}, []);
        return true;
      }
      if (modelStore.activeModelId !== model.id) {
        // something else loaded a model meanwhile: try again next launch
        return false;
      }
      const lease = await modelStore.acquireGeneration();
      if (!lease) {
        this.record(model.id, {loaded: false}, []);
        return true;
      }
      try {
        const m = await runTrial(lease.engine, () => !idleExceptUs());
        this.record(model.id, {loaded: true, ...m}, m.answers, m.ms);
        return true;
      } catch (error) {
        if (error instanceof TrialInterrupted) {
          devReportStore.report('model_trial_interrupted', {model: model.id});
          return 'interrupted';
        }
        this.record(model.id, {loaded: false}, []);
        devReportStore.reportError('model_trial_error', error, {
          model: model.id,
        });
        return true;
      } finally {
        lease.end();
      }
    } finally {
      if (previous && previous.id !== model.id) {
        await modelStore.selectModel(previous).catch(() => {});
      }
    }
  }

  private record(
    id: string,
    r: Partial<TrialResult> & {loaded: boolean},
    answers: TrialAnswer[],
    ms?: number,
  ) {
    const result: TrialResult = {
      decodeTps: 0,
      promptTps: 0,
      score: 0,
      total: 0,
      ...r,
      at: new Date().toISOString(),
      version: TRIAL_VERSION,
    };
    runInAction(() => {
      this.results[id] = {
        loaded: result.loaded,
        decodeTps: result.decodeTps,
        promptTps: result.promptTps,
        score: result.score,
        total: result.total,
        toolScore: result.toolScore,
        toolTotal: result.toolTotal,
        at: result.at,
        version: result.version,
      };
    });
    devReportStore.report('model_trial', {
      model: id,
      ...this.results[id],
      ms,
      answers: devReportStore.includeConversations
        ? answers
        : answers.map(a => ({id: a.id, ok: a.ok})),
    });
  }

  /** Deletes the models downloaded for the trial that were not chosen. */
  private async removeLosers() {
    const keep = new Set(
      [
        this.choice,
        modelStore.activeModelId,
        modelStore.lastUsedModel?.id,
      ].filter(Boolean),
    );
    for (const id of [...this.downloadedForTrial]) {
      const model = modelStore.models.find(m => m.id === id);
      if (keep.has(id)) {
        continue;
      }
      if (model?.isDownloaded && model.origin !== ModelOrigin.LOCAL) {
        const removed = await modelStore
          .deleteModel(model)
          .then(() => true)
          .catch(() => false);
        devReportStore.report('model_trial_removed', {
          model: id,
          bytes: model.size,
          removed,
        });
      }
      runInAction(() => {
        this.downloadedForTrial = this.downloadedForTrial.filter(x => x !== id);
      });
    }
  }
}

/** The trial's own generation keeps the engine busy: only the user's activity counts. */
const idleExceptUs = () => !userInChat() && !chatSessionStore.isGenerating;

/** Set by ModelUpdateStore: tries the models, then installs the choice. */
let onResume: (() => void) | undefined;
export const setTrialResumeHandler = (handler: () => void) => {
  onResume = handler;
};

export const modelTrialStore = new ModelTrialStore();
