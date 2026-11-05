import {AppState, Platform} from 'react-native';
import {makeAutoObservable, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

/**
 * Crampon (test version): development reports sent to BlandyStudio
 * (doc/upload_server.py, one JSON line per event in ~/crampon/rapports/).
 * Events wait in a persisted queue and go out in batches: at launch, every
 * few minutes, when the app goes to the background, and at once for a crash.
 * Questions and answers are a separate switch. To be removed or declared
 * before any Store release.
 */
export const REPORT_URL =
  'https://crampon.blandy-studio.com/upload/HZqMmgahyOD00UFn/rapport';

const QUEUE_KEY = 'DevReportStore.queue';
const MAX_QUEUE = 1000;
const MAX_BATCH = 200;
const FLUSH_EVERY_MS = 5 * 60 * 1000;
const LOG_LINES = 80;

export type ReportEvent = {type: string; t: string} & Record<string, unknown>;

const randomId = () =>
  Array.from({length: 4}, () =>
    Math.floor(Math.random() * 2 ** 32)
      .toString(16)
      .padStart(8, '0'),
  ).join('');

export class DevReportStore {
  /** User switch in Settings. */
  enabled = true;
  /** Also send the questions and answers. */
  includeConversations = true;
  /** Random id drawn at install: not the device's own identifiers. */
  installId = randomId();

  private queue: ReportEvent[] = [];
  private log: string[] = [];
  private sending = false;
  private started = false;
  /** The answer being generated: question, tools used, start time. */
  private answer: {question: string; tools: string[]; start: number} | null =
    null;

  constructor() {
    // Internal state stays plain: the console capture writes to `log` on
    // every console call, and MobX warnings would then feed back into it.
    makeAutoObservable<
      this,
      'queue' | 'log' | 'sending' | 'started' | 'answer'
    >(
      this,
      {queue: false, log: false, sending: false, started: false, answer: false},
      {autoBind: true},
    );
    makePersistable(this, {
      name: 'DevReportStore',
      properties: ['enabled', 'includeConversations', 'installId'],
      storage: AsyncStorage,
    }).then(this.start);
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    if (!value) {
      this.queue = [];
      AsyncStorage.removeItem(QUEUE_KEY).catch(() => {});
    }
  }

  setIncludeConversations(value: boolean) {
    this.includeConversations = value;
  }

  report(type: string, data: Record<string, unknown> = {}) {
    if (!this.enabled) {
      return;
    }
    this.queue.push({type, t: new Date().toISOString(), ...data});
    if (this.queue.length > MAX_QUEUE) {
      this.queue.splice(0, this.queue.length - MAX_QUEUE);
    }
    this.persistQueue();
  }

  /** An error, with the latest console lines; sent at once. */
  reportError(
    type: string,
    error: unknown,
    data: Record<string, unknown> = {},
  ) {
    const e = error as {message?: string; stack?: string} | undefined;
    this.report(type, {
      ...data,
      message: e?.message ?? String(error),
      stack: e?.stack?.slice(0, 4000),
      log: [...this.log],
    });
    this.flush();
  }

  startAnswer(question: string) {
    this.answer = {question, tools: [], start: Date.now()};
  }

  noteTool(name: string, ok: boolean) {
    this.answer?.tools.push(ok ? name : `${name} (failed)`);
  }

  finishAnswer(data: Record<string, unknown>, answer: string) {
    const current = this.answer;
    this.answer = null;
    this.report('answer', {
      ...data,
      ms: current ? Date.now() - current.start : undefined,
      tools: current?.tools ?? [],
      ...(this.includeConversations
        ? {question: current?.question, answer}
        : {}),
    });
  }

  failAnswer(error: unknown, data: Record<string, unknown> = {}) {
    const current = this.answer;
    this.answer = null;
    this.reportError('answer_error', error, {
      ...data,
      tools: current?.tools ?? [],
      ...(this.includeConversations ? {question: current?.question} : {}),
    });
  }

  async flush(): Promise<void> {
    if (!this.enabled || this.sending || this.queue.length === 0) {
      return;
    }
    this.sending = true;
    const batch = this.queue.slice(0, MAX_BATCH);
    try {
      const response = await fetch(REPORT_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({installId: this.installId, events: batch}),
      });
      if (response.ok) {
        runInAction(() => {
          this.queue.splice(0, batch.length);
        });
        this.persistQueue();
      }
    } catch {
      // Offline: the queue waits for the next flush.
    } finally {
      runInAction(() => {
        this.sending = false;
      });
    }
    if (this.queue.length > 0 && batch.length === MAX_BATCH) {
      return this.flush();
    }
  }

  private async start() {
    if (this.started) {
      return;
    }
    this.started = true;
    this.captureConsole();
    this.captureCrashes();
    try {
      const saved = await AsyncStorage.getItem(QUEUE_KEY);
      if (saved) {
        runInAction(() => {
          this.queue = [...JSON.parse(saved), ...this.queue].slice(-MAX_QUEUE);
        });
      }
    } catch {
      // A corrupt queue is dropped.
    }
    this.report('app_start', await this.deviceInfo());
    this.flush();
    setInterval(this.flush, FLUSH_EVERY_MS);
    AppState.addEventListener('change', state => {
      if (state === 'background') {
        this.report('app_background');
        this.flush();
      }
    });
  }

  private async deviceInfo(): Promise<Record<string, unknown>> {
    const safe = async <T>(f: () => Promise<T> | T): Promise<T | undefined> => {
      try {
        return await f();
      } catch {
        return undefined;
      }
    };
    return {
      app: DeviceInfo.getVersion(),
      build: DeviceInfo.getBuildNumber(),
      os: `${Platform.OS} ${DeviceInfo.getSystemVersion()}`,
      brand: DeviceInfo.getBrand(),
      device: DeviceInfo.getModel(),
      hardware: await safe(() => DeviceInfo.getHardware()),
      totalMemory: await safe(() => DeviceInfo.getTotalMemory()),
      freeDisk: await safe(() => DeviceInfo.getFreeDiskStorage()),
    };
  }

  private persistQueue() {
    AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue)).catch(() => {});
  }

  private captureConsole() {
    for (const level of ['log', 'info', 'warn', 'error'] as const) {
      const original = console[level];
      console[level] = (...args: unknown[]) => {
        this.log.push(
          `${new Date().toISOString().slice(11, 19)} ${level} ${args
            .map(a =>
              typeof a === 'string'
                ? a
                : a instanceof Error
                  ? a.message
                  : safeJson(a),
            )
            .join(' ')
            .slice(0, 500)}`,
        );
        if (this.log.length > LOG_LINES) {
          this.log.shift();
        }
        original(...args);
      };
    }
  }

  private captureCrashes() {
    const errorUtils = (
      global as unknown as {
        ErrorUtils?: {
          getGlobalHandler: () => (error: Error, isFatal?: boolean) => void;
          setGlobalHandler: (
            handler: (error: Error, isFatal?: boolean) => void,
          ) => void;
        };
      }
    ).ErrorUtils;
    if (!errorUtils) {
      return;
    }
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      this.reportError(isFatal ? 'crash' : 'js_error', error);
      previous(error, isFatal);
    });
  }
}

const safeJson = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const devReportStore = new DevReportStore();
