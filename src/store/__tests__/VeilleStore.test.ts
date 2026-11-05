import {Platform} from 'react-native';

import {runVeille} from '../../services/veille';
import {devReportStore} from '../DevReportStore';
import {VeilleStore} from '../VeilleStore';

jest.mock('../../services/veille', () => ({runVeille: jest.fn()}));

const comparison = {
  agree: true,
  gaps: {},
  pendingHeads: {},
  llamaRn: '0.13.0-rc.9',
  repos: 3,
  benchmarkRows: 45,
  samePocketpalRules: true,
  unreadPublishers: [],
  rules: {tiers: {}},
};

describe('VeilleStore', () => {
  const originalOS = Platform.OS;
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', {value: 'android'});
    (runVeille as jest.Mock).mockResolvedValue(comparison);
  });
  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {value: originalOS});
  });

  it('runs once a day and reports the comparison, not the rules', async () => {
    const store = new VeilleStore();
    await store.maybeRun();

    expect(runVeille).toHaveBeenCalledTimes(1);
    expect(devReportStore.report).toHaveBeenCalledWith(
      'veille',
      expect.objectContaining({agree: true, repos: 3}),
    );
    expect(
      (devReportStore.report as jest.Mock).mock.calls[0][1],
    ).not.toHaveProperty('rules');
    expect(store.nextRunAfter).toBeGreaterThan(Date.now() + 23 * 3600e3);

    // once a day
    await store.maybeRun();
    expect(runVeille).toHaveBeenCalledTimes(1);
  });

  it('reports a failure and retries an hour later', async () => {
    (runVeille as jest.Mock).mockRejectedValue(new Error('HTTP 503'));
    const store = new VeilleStore();
    await store.maybeRun();
    expect(devReportStore.reportError).toHaveBeenCalledWith(
      'veille_error',
      expect.any(Error),
      expect.any(Object),
    );
    expect(store.nextRunAfter).toBeLessThan(Date.now() + 2 * 3600e3);
    expect(store.running).toBe(false);
  });

  it('stays off when the development reports are off', async () => {
    (devReportStore as {enabled: boolean}).enabled = false;
    const store = new VeilleStore();
    await store.maybeRun();
    (devReportStore as {enabled: boolean}).enabled = true;
    expect(runVeille).not.toHaveBeenCalled();
  });
});
