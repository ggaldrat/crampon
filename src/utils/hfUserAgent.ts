import DeviceInfo from 'react-native-device-info';

/**
 * User-Agent for outbound Hugging Face requests (API + model downloads).
 * Crampon names itself, not PocketPal: its downloads are not PocketPal's.
 */
export const hfUserAgent = (): string =>
  `Crampon/${DeviceInfo.getVersion()} (github.com/ggaldrat/crampon)`;
