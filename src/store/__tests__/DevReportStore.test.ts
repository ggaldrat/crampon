// The shared AsyncStorage mock exports nothing usable here.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

// Fake timers before loading: the module's own instance starts a flush timer
// that would otherwise keep Jest running.
jest.useFakeTimers({doNotFake: ['setImmediate']});

// Never the real network: the module's own instance sends its launch report
// as soon as it loads, and Node has a working fetch.
const offline = () => jest.fn().mockRejectedValue(new Error('no network'));
(global as unknown as {fetch: jest.Mock}).fetch = offline();

// jest/setup.ts mocks this store for every other suite.
const {DevReportStore, REPORT_URL} = jest.requireActual('../DevReportStore');

const flush = () => new Promise(resolve => setImmediate(resolve));

describe('DevReportStore', () => {
  let fetchMock: jest.Mock;
  const originalConsole = {...console};

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ok: true});
    (global as unknown as {fetch: jest.Mock}).fetch = fetchMock;
  });

  afterEach(() => {
    Object.assign(console, originalConsole);
    (global as unknown as {fetch: jest.Mock}).fetch = offline();
  });

  const sentEvents = () =>
    fetchMock.mock.calls.flatMap(
      ([, init]) => JSON.parse(init.body).events as {type: string}[],
    );

  it('sends the launch report with the device, then empties its queue', async () => {
    const store = new DevReportStore();
    await flush();
    await flush();

    expect(fetchMock).toHaveBeenCalledWith(
      REPORT_URL,
      expect.objectContaining({method: 'POST'}),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.installId).toBe(store.installId);
    expect(body.events[0]).toEqual(
      expect.objectContaining({type: 'app_start', os: expect.any(String)}),
    );

    fetchMock.mockClear();
    await store.flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the events when the server is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const store = new DevReportStore();
    await flush();
    store.report('model_load', {model: 'a'});
    await store.flush();

    fetchMock.mockResolvedValue({ok: true});
    await store.flush();
    expect(sentEvents().map(e => e.type)).toEqual(
      expect.arrayContaining(['app_start', 'model_load']),
    );
  });

  it('adds the question and answer only when that switch is on', async () => {
    const store = new DevReportStore();
    await flush();
    store.startAnswer('Quelle heure ?');
    store.noteTool('get_time', true);
    store.finishAnswer({model: 'a'}, 'Il est midi.');
    store.setIncludeConversations(false);
    store.startAnswer('Secret ?');
    store.finishAnswer({model: 'a'}, 'Non.');
    await store.flush();

    const answers = sentEvents().filter(e => e.type === 'answer');
    expect(answers[0]).toEqual(
      expect.objectContaining({
        question: 'Quelle heure ?',
        answer: 'Il est midi.',
        tools: ['get_time'],
      }),
    );
    expect(answers[1]).not.toHaveProperty('question');
    expect(answers[1]).not.toHaveProperty('answer');
  });

  it('attaches the latest console lines to an error', async () => {
    const store = new DevReportStore();
    await flush();
    console.warn('model load slow');
    store.reportError('model_load_error', new Error('out of memory'));
    await flush();

    const error = sentEvents().find(e => e.type === 'model_load_error') as
      | {message: string; log: string[]}
      | undefined;
    expect(error?.message).toBe('out of memory');
    expect(error?.log.some(line => line.includes('model load slow'))).toBe(
      true,
    );
  });

  it('records nothing once switched off', async () => {
    const store = new DevReportStore();
    await flush();
    store.setEnabled(false);
    fetchMock.mockClear();
    store.report('model_load');
    await store.flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
