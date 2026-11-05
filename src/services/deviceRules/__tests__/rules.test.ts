import {fetchRules} from '../rules';

// The signature itself is tested in signature.test.ts: here a signature file
// is valid when its `signature` is 'valid'.
jest.mock('../signature', () => ({
  verifyRules: (_text: string, sig: {signature: string; signedAt: string}) =>
    sig.signature === 'valid' ? sig.signedAt : null,
}));

const thinCandidate = {
  model: 'gemma-3-1b-it',
  hf_repo: 'ggml-org/gemma-3-1b-it-GGUF',
  hf_filename: 'gemma-3-1b-it-Q4_K_M.gguf',
  params: 999885952,
  size_bytes: 806058240,
};

const newSchemaDoc = {
  schema_version: '2.0.0',
  platform: 'android',
  rules_version: '2026-06-10.1',
  classifier: {
    ram_bands: [{id: 'all', max_bytes: null}],
    tier_matrix: [{ram_band: 'all', soc_class: 'mid', tier: 'mid'}],
  },
  tiers: {mid: {candidates: [thinCandidate]}},
};

const oldFatDoc = {
  schema_version: '2.0.0-draft',
  platform: 'android',
  rules_version: '2026-06-09.1',
  classifier: {
    ram_bands: [{id: 'all', max_bytes: null}],
    tier_matrix: [{ram_band: 'all', soc_class: 'mid', tier: 'mid'}],
  },
  tiers: {
    mid: {
      models: [
        {
          hfModel: {id: 'a/b', author: 'a', url: 'u'},
          modelFile: {rfilename: 'x.gguf'},
        },
      ],
    },
  },
};

const validSig = {
  sha256: 'x',
  signedAt: '2026-11-05T21:00:00Z',
  signature: 'valid',
};

// Serves `doc` as the rules and `sig` as <rules>.sig, at every source.
const serve = (doc: unknown, sig: unknown = validSig) => {
  const fetchMock = jest
    .fn()
    .mockImplementation(async (url: string) =>
      url.endsWith('.sig')
        ? {ok: true, json: async () => sig}
        : {ok: true, text: async () => JSON.stringify(doc)},
    );
  (global as unknown as {fetch: jest.Mock}).fetch = fetchMock;
  return fetchMock;
};

describe('fetchRules', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as unknown as {fetch?: unknown}).fetch;
  });

  it('returns parsed rules for a valid thin candidates doc', async () => {
    serve(newSchemaDoc);
    const rules = await fetchRules('1.17.3', 'android');
    expect(rules).not.toBeNull();
    expect(rules?.tiers.mid.models).toHaveLength(1);
    expect(rules?.signedAt).toBe(validSig.signedAt);
  });

  it.each(['1.2.0-draft', '3.0.0', '2', 'v2.0.0', 'two'])(
    'returns null (→ bundled floor) for schema_version %p',
    async schemaVersion => {
      serve({...newSchemaDoc, schema_version: schemaVersion});
      expect(await fetchRules('1.17.3', 'android')).toBeNull();
    },
  );

  it('returns null (→ bundled floor) for an old fat models[] schema doc', async () => {
    serve(oldFatDoc);
    expect(await fetchRules('1.17.3', 'android')).toBeNull();
  });

  it('returns null (→ bundled floor) when every candidate is gated out', async () => {
    serve({
      ...newSchemaDoc,
      tiers: {
        mid: {candidates: [{...thinCandidate, min_app_version: '99.0.0'}]},
      },
    });
    expect(await fetchRules('1.17.3', 'android')).toBeNull();
  });

  it('passes the app version through to the gates', async () => {
    serve({
      ...newSchemaDoc,
      tiers: {
        mid: {candidates: [{...thinCandidate, min_app_version: '1.17.3'}]},
      },
    });
    expect(await fetchRules('1.17.3', 'android')).not.toBeNull();
    expect(await fetchRules('1.17.2', 'android')).toBeNull();
  });

  it('falls back to the next source when the first one fails', async () => {
    const fetchMock = serve(newSchemaDoc);
    fetchMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'));
    const rules = await fetchRules('1.17.3', 'android');
    expect(rules?.source).toContain('crampon.blandy-studio.com');
  });

  it('refuses unsigned or badly signed rules', async () => {
    serve(newSchemaDoc, {...validSig, signature: 'forged'});
    expect(await fetchRules('1.17.3', 'android')).toBeNull();

    const fetchMock = serve(newSchemaDoc);
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('.sig')
        ? {ok: false, status: 404}
        : {ok: true, text: async () => JSON.stringify(newSchemaDoc)},
    );
    expect(await fetchRules('1.17.3', 'android')).toBeNull();
  });

  it('refuses rules signed before the last ones accepted', async () => {
    serve(newSchemaDoc);
    expect(
      await fetchRules('1.17.3', 'android', '2026-11-06T00:00:00Z'),
    ).toBeNull();
    expect(
      await fetchRules('1.17.3', 'android', validSig.signedAt),
    ).not.toBeNull();
  });

  it('needs no signature for the upstream iOS rules', async () => {
    const fetchMock = serve({...newSchemaDoc, platform: 'ios'}, null);
    expect(await fetchRules('1.17.3', 'ios')).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null for garbage JSON that fails to parse', async () => {
    serve({not: 'rules'});
    expect(await fetchRules('1.17.3', 'android')).toBeNull();
  });

  it('returns null on a non-2xx response', async () => {
    (global as unknown as {fetch: jest.Mock}).fetch = jest
      .fn()
      .mockResolvedValue({ok: false, status: 404});
    expect(await fetchRules('1.17.3', 'android')).toBeNull();
  });

  it('returns null on a network error', async () => {
    (global as unknown as {fetch: jest.Mock}).fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline'));
    expect(await fetchRules('1.17.3', 'android')).toBeNull();
  });

  it('returns null on a platform mismatch', async () => {
    serve({...newSchemaDoc, platform: 'ios'});
    expect(await fetchRules('1.17.3', 'android')).toBeNull();
  });
});
