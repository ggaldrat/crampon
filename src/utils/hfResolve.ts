import {fetchModelInfo, fetchModelFilesDetails} from '../api/hf';
import {HF_DOMAIN} from '../config/urls';

import {createSiblingsFromFileDetails} from './hf';
import type {HuggingFaceModel, ModelFile} from './types';

/**
 * Strict, repo-level resolver: fetches a HuggingFace repo and assembles a full
 * `HuggingFaceModel` whose `siblings` each carry a real `/resolve/` download
 * `url`.
 *
 * It must go through `createSiblingsFromFileDetails` so every sibling has a
 * download URL — a hand-built `ModelFile` has none, which makes the downstream
 * space-check/download a silent no-op.
 *
 * No fallback and no filename selection: a fetch failure throws.
 *
 * @param repoId - "author/model"
 */
export const resolveHFRepo = async (
  repoId: string,
): Promise<HuggingFaceModel> => {
  const [modelInfo, fileDetails] = await Promise.all([
    fetchModelInfo({repoId, full: true}),
    fetchModelFilesDetails(repoId),
  ]);

  const siblings = createSiblingsFromFileDetails(repoId, fileDetails);

  return assembleHFModel(repoId, siblings, modelInfo);
};

/**
 * Assembles a `HuggingFaceModel` from the repo siblings and the (possibly null)
 * model-info response, applying HF_DOMAIN and per-field defaults.
 */
const assembleHFModel = (
  repoId: string,
  siblings: ModelFile[],
  modelInfo: any,
): HuggingFaceModel =>
  modelInfo
    ? {
        _id: modelInfo._id || repoId,
        id: modelInfo.id || repoId,
        author: modelInfo.author || '',
        gated: modelInfo.gated || false,
        inference: modelInfo.inference || 'cold',
        lastModified: modelInfo.lastModified || new Date().toISOString(),
        likes: modelInfo.likes || 0,
        trendingScore: modelInfo.trendingScore || 0,
        private: modelInfo.private || false,
        sha: modelInfo.sha || '',
        downloads: modelInfo.downloads || 0,
        tags: modelInfo.tags || [],
        library_name: modelInfo.library_name || '',
        createdAt: modelInfo.createdAt || new Date().toISOString(),
        model_id: modelInfo.model_id || repoId,
        url: modelInfo.url || `${HF_DOMAIN}/${repoId}`,
        specs: modelInfo.specs,
        siblings,
      }
    : {
        _id: repoId,
        id: repoId,
        author: '',
        gated: false,
        inference: 'cold',
        lastModified: new Date().toISOString(),
        likes: 0,
        trendingScore: 0,
        private: false,
        sha: '',
        downloads: 0,
        tags: [],
        library_name: '',
        createdAt: new Date().toISOString(),
        model_id: repoId,
        url: `${HF_DOMAIN}/${repoId}`,
        specs: undefined,
        siblings,
      };
