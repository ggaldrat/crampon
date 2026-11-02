import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  /** versionCode of the running build, and whether Crampon installed itself. */
  getInfo(): Promise<{versionCode: number; selfInstalled: boolean}>;
  /**
   * Installs the APK at `path` over the running app. Resolves 'committed'
   * (the app is about to be replaced) or rejects with the installer error.
   */
  install(path: string): Promise<string>;
  /** Last install failure reported by Android, then forgets it. */
  takeLastError(): Promise<string | null>;
}

// Android only: iOS has no implementation, so this is null there.
export default TurboModuleRegistry.get<Spec>('AppUpdaterModule');
