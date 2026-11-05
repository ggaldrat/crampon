import {when} from 'mobx';

import {modelStore} from './ModelStore';

import {Model} from '../utils/types';

/**
 * Crampon: downloads a model silently and waits for the end. False on a
 * network or storage error, which is hidden: the caller retries at the next
 * launch. Used by the model update and the model trial.
 */
export const ensureDownloaded = async (target: Model): Promise<boolean> => {
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
  if (modelStore.downloadError?.metadata?.modelId === target.id) {
    modelStore.clearDownloadError();
  }
  return false;
};
