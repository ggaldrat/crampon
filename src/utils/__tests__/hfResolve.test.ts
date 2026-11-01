/**
 * HF repo resolver.
 *
 * resolveHFRepo — strict, repo-level core: assembles the full HuggingFaceModel
 * with populated /resolve/ sibling URLs; throws on any fetch failure.
 *
 * It guards the silent-no-op regression: resolved URLs must be non-empty
 * /resolve/ URLs (the whole point of routing through
 * createSiblingsFromFileDetails rather than a hand-built ModelFile).
 */

import {resolveHFRepo} from '../hfResolve';
import {fetchModelInfo, fetchModelFilesDetails} from '../../api/hf';

jest.mock('../../api/hf', () => ({
  fetchModelInfo: jest.fn(),
  fetchModelFilesDetails: jest.fn(),
}));

const mockFetchModelInfo = fetchModelInfo as jest.Mock;
const mockFetchModelFilesDetails = fetchModelFilesDetails as jest.Mock;

const REPO = 'author/model';
const FILE = 'model.Q4_K_M.gguf';

const modelInfoResponse = {
  _id: 'abc',
  id: REPO,
  author: 'author',
};

const fileDetails = [
  {path: FILE, size: 4096, oid: 'oid1', lfs: {oid: 'lfs1'}},
  {path: 'other.Q8_0.gguf', size: 8192, oid: 'oid2'},
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveHFRepo — strict repo-level core', () => {
  it('assembles the full model with populated /resolve/ sibling urls', async () => {
    mockFetchModelInfo.mockResolvedValue(modelInfoResponse);
    mockFetchModelFilesDetails.mockResolvedValue(fileDetails);

    const hfModel = await resolveHFRepo(REPO);

    expect(hfModel.id).toBe(REPO);
    expect(hfModel.author).toBe('author');
    expect(hfModel.siblings.length).toBe(fileDetails.length);
    // Every sibling must carry a real download URL, else a tap no-ops.
    expect(hfModel.siblings.every(s => !!s.url)).toBe(true);
    expect(hfModel.siblings.every(s => s.url!.includes('/resolve/'))).toBe(
      true,
    );
  });

  it('throws when fetchModelInfo fails', async () => {
    mockFetchModelInfo.mockRejectedValue(new Error('network 404'));
    mockFetchModelFilesDetails.mockResolvedValue(fileDetails);

    await expect(resolveHFRepo(REPO)).rejects.toThrow();
  });

  it('throws when fetchModelFilesDetails fails', async () => {
    mockFetchModelInfo.mockResolvedValue(modelInfoResponse);
    mockFetchModelFilesDetails.mockRejectedValue(new Error('network 500'));

    await expect(resolveHFRepo(REPO)).rejects.toThrow();
  });
});
