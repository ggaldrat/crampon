/**
 * First-launch auto-setup E2E spec.
 *
 * There is no onboarding UI left at all — no splash screen, no picker,
 * no "Skip for now" button. On a fresh install, `useAutoModelSetup`
 * (called from `App`) silently registers the recommended model,
 * downloads it, and loads it into memory while the app renders the
 * normal Chat screen the whole time; progress is whatever the app's
 * own download banner shows. This spec only verifies that first-launch
 * flow actually lands on a working, model-ready Chat — it can't drive
 * any onboarding-specific UI because none exists.
 *
 * Runs against a fresh-install state; the onboarding-bypass capability
 * (see AutomationBridge `__E2E_SKIP_ONBOARDING__`) is left UNSET for
 * this spec so the real auto-download path actually runs.
 *
 * Usage:
 *   yarn e2e:ios --spec onboarding --skip-build
 *   yarn e2e:android --spec onboarding --skip-build
 */

import * as path from 'path';

import {ChatPage} from '../../pages/ChatPage';
import {byTestId} from '../../helpers/selectors';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

const TIMEOUT = 15000;
// The auto-download is a real network fetch of the recommended model —
// give it the same headroom other download-dependent specs use.
const DOWNLOAD_TIMEOUT = Number(process.env.E2E_DOWNLOAD_TIMEOUT) || 900000;

const getAppId = (): string =>
  (driver as any).isAndroid ? 'com.pocketpalai.e2e' : 'ai.pocketpal';

const reinstallApp = async (): Promise<void> => {
  const appId = getAppId();
  const appPath = (browser.requestedCapabilities as any)['appium:app'];
  await (driver as any).removeApp(appId);
  await (driver as any).installApp(path.resolve(appPath));
  await (driver as any).activateApp(appId);
};

const isDisplayedSafe = async (testId: string): Promise<boolean> =>
  browser
    .$(byTestId(testId))
    .isDisplayed()
    .catch(() => false);

describe('First-launch auto-setup (no onboarding UI)', () => {
  let chat: ChatPage;

  before(() => {
    chat = new ChatPage();
  });

  describe('from a fresh install', () => {
    before(reinstallApp);

    it('downloads and activates the recommended model with zero taps, landing on a ready Chat', async () => {
      await chat.waitForReady(DOWNLOAD_TIMEOUT);
      // Nothing onboarding-shaped should ever have existed in this tree.
      expect(await isDisplayedSafe('onboarding-splash')).toBe(false);
      expect(await isDisplayedSafe('onboarding-screen-6')).toBe(false);
    });
  });

  describe('cold restart', () => {
    it('is still ready with no re-download', async () => {
      const appId = getAppId();
      await (driver as any).terminateApp(appId);
      await (driver as any).activateApp(appId);

      await chat.waitForReady(TIMEOUT);
    });
  });
});
