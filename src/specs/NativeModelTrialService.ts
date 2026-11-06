import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  /**
   * Starts (or updates) the foreground service that keeps the app running,
   * screen off or in the background, with a notification showing `text`.
   */
  start(text: string): void;
  stop(): void;
}

// Android only: iOS has no implementation, so this is null there.
export default TurboModuleRegistry.get<Spec>('ModelTrialServiceModule');
