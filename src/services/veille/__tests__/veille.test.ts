import {parseBenchmark, pyRound, BenchmarkRow} from '../benchmark';
import {baseModel, Catalogue, refreshCatalogue, sizesOf} from '../catalogue';
import {compareRules} from '../compare';
import {computeRules, normalize, parseCsv, Rules} from '../recommend';

const pageWith = (data: unknown) => {
  const text = `0:junk${JSON.stringify(data)}trailing`;
  // Next.js splits its payload into string chunks
  const half = Math.floor(text.length / 2);
  return [text.slice(0, half), text.slice(half)]
    .map(c => `<script>self.__next_f.push([1,${JSON.stringify(c)}])</script>`)
    .join('');
};

const evals = (s: number) => ({
  bfcl_small: {score: s},
  ifbench: {score: s},
  gpqa: {score: s},
  math_500: {score: s},
  omniscience: {accuracy: s, hallucinationRate: 1 - s},
});

describe('parseBenchmark', () => {
  const filler = Array.from({length: 20}, (_, i) => ({
    modelId: `f${i}`,
    name: `Filler ${i} (Q4_K_M)`,
    quant: 'Q4_K_M',
    servedContextTokens: 16384,
    evalScores: evals(0.1),
  }));
  const page = pageWith({
    devices: [{deviceKey: 's26', name: 'Galaxy S26 Ultra'}],
    models: [
      {
        modelId: 'a16',
        name: 'Qwen3 4B (Reasoning, Q4_K_M) (16K Context)',
        quant: 'Q4_K_M',
        servedContextTokens: 16384,
        evalScores: evals(0.6),
      },
      {
        modelId: 'a64',
        name: 'Qwen3 4B (Reasoning, Q4_K_M) (64K Context)',
        quant: 'Q4_K_M',
        servedContextTokens: 65536,
        evalScores: evals(0.1),
      },
      ...filler,
    ],
    measurements: [
      {
        modelId: 'a16',
        deviceKey: 's26',
        metric: 'end_to_end_latency',
        prefillTokens: 1024,
        value: 21_340,
      },
    ],
  });

  it('merges the 16K and 64K builds and keeps the 16K score and Android time', () => {
    const rows = parseBenchmark(page);
    expect(rows[0]).toEqual({
      model: 'Qwen3 4B (Reasoning)',
      quant: 'Q4_K_M',
      score16k: 60,
      s26E2eS: 21.3,
    });
    expect(rows).toHaveLength(21);
  });

  it('refuses a page with too few builds', () => {
    expect(() =>
      parseBenchmark(pageWith({devices: [], models: [], measurements: []})),
    ).toThrow(/builds/);
  });

  it('rounds halves like Python', () => {
    expect(pyRound(62.5)).toBe(62);
    expect(pyRound(63.5)).toBe(64);
    expect(pyRound(2.04, 1)).toBe(2);
  });
});

describe('normalize', () => {
  it('matches rules, repos and benchmark names', () => {
    expect(normalize('lmstudio-community/Qwen3-4B-Instruct-GGUF')).toBe(
      'qwen34b',
    );
    expect(normalize('Qwen3 4B (Reasoning)')).toBe('qwen34b');
    expect(normalize('google/gemma-3-1b-it')).toBe('gemma31b');
  });
});

describe('parseCsv', () => {
  it('reads quoted fields', () => {
    expect(parseCsv('model,source\nA,"x, ""y"""\n')).toEqual([
      {model: 'A', source: 'x, "y"'},
    ]);
  });
});

describe('baseModel', () => {
  it('prefers the quantized-from tag', () => {
    expect(
      baseModel({
        id: 'x/A-GGUF',
        tags: ['base_model:org/A-Base', 'base_model:quantized:org/A'],
      }),
    ).toBe('org/A');
    expect(baseModel({id: 'x/A-GGUF', tags: []})).toBe('x/A-GGUF');
  });
});

describe('computeRules', () => {
  const candidate = (model: string) => ({
    model,
    hf_repo: `org/${model}-GGUF`,
    hf_filename: `${model}-Q4_K_M.gguf`,
  });
  const pocketpalRules: Rules = {
    rules_version: '2026-11-04.1',
    tiers: {
      low: {candidates: [candidate('old-small')]},
      mid: {candidates: [candidate('old-mid')]},
      high: {candidates: []},
      flagship: {candidates: [candidate('old-big')]},
    },
  };
  const entry = (publisher: string, base: string, downloads = 0) => ({
    publisher,
    baseModel: base,
    architecture: 'llama',
    params: 1e9,
    downloads,
    lastModified: '2026-11-01',
    createdAt: '2026-11-01',
  });
  const catalogue: Catalogue = {
    'bartowski/New-1B-GGUF': entry('bartowski', 'lab/New-1B', 9999),
    'lmstudio-community/New-1B-GGUF': entry('lmstudio-community', 'lab/New-1B'),
    'lmstudio-community/Slow-1B-GGUF': entry(
      'lmstudio-community',
      'lab/Slow-1B',
    ),
    'lmstudio-community/Broken-1B-GGUF': entry(
      'lmstudio-community',
      'lab/Broken-1B',
    ),
    'lmstudio-community/Alien-1B-GGUF': {
      ...entry('lmstudio-community', 'lab/Alien-1B'),
      architecture: 'alien',
    },
    'lmstudio-community/Unscored-1B-GGUF': entry(
      'lmstudio-community',
      'lab/Unscored-1B',
    ),
  };
  const benchmark: BenchmarkRow[] = [
    {model: 'New 1B', quant: 'Q4_K_M', score16k: 50, s26E2eS: 10},
    {model: 'Slow 1B', quant: 'Q4_K_M', score16k: 70, s26E2eS: 45},
    {model: 'Broken 1B', quant: 'Q4_K_M', score16k: 70, s26E2eS: 5},
    {model: 'Alien 1B', quant: 'Q4_K_M', score16k: 70, s26E2eS: 5},
    {model: 'old-small', quant: 'Q4_K_M', score16k: 40, s26E2eS: 5},
    {model: 'old-big', quant: 'Q4_K_M', score16k: 60, s26E2eS: 5},
  ];
  const compat = parseCsv(
    'model,moteur,compatibilite,date,source\n' +
      'Broken-1B,llama.cpp,echec,2026-11-01,hand test\n',
  );

  it('adds the phone-validated models and reads sizes only for them', async () => {
    const read: string[] = [];
    const rules = await computeRules({
      pocketpalRules,
      catalogue,
      benchmark,
      compat,
      supportedArchs: new Set(['llama']),
      sizesOf: async repo => {
        read.push(repo);
        return repo.startsWith('lmstudio')
          ? {Q4_K_M: ['New-1B-Q4_K_M.gguf', 800e6]}
          : {};
      },
    });
    const keys = (t: string) =>
      rules.tiers[t].candidates!.map(c => `${c.hf_repo}/${c.hf_filename}`);

    // 800 MB → about 1.7 GB of RAM: the low tier. It beats the low tier's
    // best score (40), so it goes first there and in the tiers above whose
    // best score is lower; in flagship (60) it does not.
    const added = 'lmstudio-community/New-1B-GGUF/New-1B-Q4_K_M.gguf';
    expect(keys('low')).toEqual([
      added,
      'org/old-small-GGUF/old-small-Q4_K_M.gguf',
    ]);
    expect(keys('mid')[0]).toBe(added);
    expect(keys('flagship')).toEqual(['org/old-big-GGUF/old-big-Q4_K_M.gguf']);
    // slow, failed by hand, unsupported or unscored: never read
    expect(read).toEqual(['lmstudio-community/New-1B-GGUF']);
    expect(rules.tiers.low.candidates![0]).toEqual(
      expect.objectContaining({quant: 'q4_k_m', min_ram_gb: 1.7}),
    );
  });
});

describe('compareRules', () => {
  const rules = (...files: string[]): Rules => ({
    tiers: {
      low: {
        candidates: files.map(f => ({model: f, hf_repo: 'r', hf_filename: f})),
      },
    },
  });

  it('agrees on the same ordered lists', () => {
    expect(compareRules(rules('a', 'b'), rules('a', 'b')).agree).toBe(true);
  });

  it('tolerates a new first model the reference is still waiting on', () => {
    const c = compareRules(rules('b', 'a'), rules('a', 'b'));
    expect(c).toEqual({agree: true, gaps: {}, pendingHeads: {low: 'r/b'}});
  });

  it('reports a difference with both lists', () => {
    const c = compareRules(rules('a', 'c'), rules('a', 'b'));
    expect(c.agree).toBe(false);
    expect(c.gaps.low).toEqual({
      app: ['r/a', 'r/c'],
      reference: ['r/a', 'r/b'],
    });
  });
});

describe('catalogue', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn();
    (global as unknown as {fetch: jest.Mock}).fetch = fetchMock;
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const settle = async <T>(p: Promise<T>): Promise<T> => {
    let done = false;
    p.finally(() => {
      done = true;
    });
    while (!done) {
      await jest.advanceTimersByTimeAsync(1000);
    }
    return p;
  };
  const ok = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
  });

  it('keeps the small, ungated, chat models of each publisher', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('author=lmstudio-community')
        ? ok([
            {
              id: 'lmstudio-community/A-GGUF',
              gguf: {total: 1e9, architecture: 'llama'},
              tags: ['base_model:quantized:lab/A'],
              downloads: 5,
              lastModified: 't1',
              createdAt: '2026-11-01T00:00:00Z',
            },
            {id: 'x/Big-GGUF', gguf: {total: 20e9, architecture: 'llama'}},
            {id: 'x/A-embed-GGUF', gguf: {total: 1e8, architecture: 'llama'}},
            {id: 'x/Gated-GGUF', gated: 'auto', gguf: {total: 1e9}},
          ])
        : url.includes('author=unsloth')
          ? {ok: false, status: 500}
          : ok([]),
    );
    const catalogue: Catalogue = {};
    const failed = await settle(refreshCatalogue(catalogue));
    expect(Object.keys(catalogue)).toEqual(['lmstudio-community/A-GGUF']);
    expect(catalogue['lmstudio-community/A-GGUF']).toEqual(
      expect.objectContaining({baseModel: 'lab/A', createdAt: '2026-11-01'}),
    );
    expect(failed).toEqual(['unsloth']);
  });

  it('reads the tracked quantizations once per repo version', async () => {
    fetchMock.mockResolvedValue(
      ok([
        {path: 'A-Q4_K_M.gguf', size: 900},
        {path: 'A-Q8_0.gguf', size: 1800},
        {path: 'mmproj-A-Q8_0.gguf', size: 10},
        {path: 'A-Q4_0-00001-of-00002.gguf', size: 5},
      ]),
    );
    const catalogue: Catalogue = {
      'x/A-GGUF': {
        publisher: 'x',
        baseModel: 'x/A',
        architecture: 'llama',
        params: 1e9,
        downloads: 0,
        lastModified: 't1',
        createdAt: '',
      },
    };
    const sizes = await settle(sizesOf(catalogue, 'x/A-GGUF'));
    expect(sizes).toEqual({
      Q4_K_M: ['A-Q4_K_M.gguf', 900],
      Q8_0: ['A-Q8_0.gguf', 1800],
    });
    await settle(sizesOf(catalogue, 'x/A-GGUF'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
