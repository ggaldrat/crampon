import {stripThinking, TRIAL_QUESTIONS} from '../questions';
import {runTrial, TrialInterrupted} from '../runTrial';

const call = (name: string, args: object) => ({
  type: 'function' as const,
  function: {name, arguments: JSON.stringify(args)},
});

// Tool calls the model makes, by question; none when absent.
const GOOD_CALLS: Record<string, ReturnType<typeof call>[]> = {
  'outil-calcul': [call('calculate', {expression: '4817 * 2963'})],
  'outil-heure': [call('datetime', {timezone: 'Asia/Tokyo'})],
  'outil-wikipedia': [call('wikipedia', {query: 'Marie Curie'})],
};
const BAD_CALLS: Record<string, ReturnType<typeof call>[]> = {
  'outil-calcul': [call('calculate', {expression: '48 * 2963'})],
  'outil-heure': [call('datetime', {})],
  'outil-wikipedia': [call('wikipedia', {query: 'radium'})],
  'outil-aucun': [call('wikipedia', {query: 'assistant'})],
};

// One good and one bad answer per question, as small models write them.
const GOOD: Record<string, string> = {
  capitale: 'Canberra.',
  multiplication: '391',
  pommes: '7',
  auteur: 'Victor Hugo',
  fleuve: 'La Loire',
  'oui-non': 'Non.',
  envers: 'ruojnob',
  traduction: 'The cat is sleeping on the sofa.',
  json: '```json\n{"ville": "Lyon", "pays": "France"}\n```',
  liste: 'Rouge, jaune, bleu',
  explication:
    'La lumière du soleil est diffusée par les molécules de l’air. Le bleu est la couleur la plus diffusée, et elle nous arrive de partout dans le ciel.',
  inspecteur:
    "L'inspecteur Gadget est le personnage principal d'une série de dessins animés, un policier bardé de gadgets.",
  'outil-calcul': '',
  'outil-heure': '',
  'outil-wikipedia': '',
  'outil-aucun':
    'Je peux répondre à tes questions, faire des calculs et chercher sur Wikipédia.',
};
const BAD: Record<string, string> = {
  capitale: 'Sydney.',
  multiplication: '17 × 23 = 381',
  pommes: '3 + 5 = 8',
  auteur: 'Émile Zola',
  fleuve: 'La Seine',
  'oui-non': 'Oui, bien sûr.',
  envers: 'bonjour',
  traduction: 'Le chat dort.',
  json: 'Lyon est en France.',
  liste:
    'Les couleurs primaires sont le rouge, le jaune et le bleu, comme on l’apprend à l’école.',
  explication: 'The sky is blue because of the scattering of light by the air.',
  inspecteur: "Qui est l'inspecteur gadget ? Je ne sais pas.",
  'outil-calcul': '14 272 771',
  'outil-heure': 'Il est 15 h.',
  'outil-wikipedia': 'Marie Curie est née en 1867.',
  'outil-aucun': '',
};

describe('trial questions', () => {
  it.each(TRIAL_QUESTIONS.map(q => [q.id, q] as const))(
    '%s: accepts a right answer and refuses a wrong one',
    (id, q) => {
      expect(q.check(GOOD[id], GOOD_CALLS[id] ?? [])).toBe(true);
      expect(q.check(BAD[id], [])).toBe(false);
      if (BAD_CALLS[id]) {
        expect(q.check(GOOD[id], BAD_CALLS[id])).toBe(false);
      }
    },
  );

  it('wants the right reason for the blue sky', () => {
    const q = TRIAL_QUESTIONS.find(x => x.id === 'explication')!;
    expect(
      q.check(
        "Le ciel est bleu à cause de l'ozone qui bloque la lumière du soleil dans l'atmosphère.",
        [],
      ),
    ).toBe(false);
  });

  it('drops the reasoning before checking', () => {
    expect(stripThinking('<think>17×23 = 391</think>\n391')).toBe('391');
    expect(stripThinking('<think>unfinished')).toBe('');
  });
});

describe('runTrial', () => {
  const engine = (
    answers: Record<string, string>,
    calls: Record<string, ReturnType<typeof call>[]> = GOOD_CALLS,
  ) => ({
    completion: jest.fn(async ({messages}: any) => {
      const prompt: string = messages[messages.length - 1].content;
      const q = TRIAL_QUESTIONS.find(x => x.prompt === prompt);
      const text = q ? answers[q.id] : 'Résumé.';
      return {
        text,
        content: text,
        tool_calls: q ? calls[q.id] : undefined,
        timings: q
          ? undefined
          : {predicted_per_second: 8.5, prompt_per_second: 31},
      };
    }),
    stopCompletion: jest.fn(),
  });

  it('measures the speed and scores the answers', async () => {
    const e = engine({...GOOD, capitale: 'Sydney'});
    const m = await runTrial(e, () => false);
    expect(m).toEqual(
      expect.objectContaining({
        decodeTps: 8.5,
        promptTps: 31,
        score: TRIAL_QUESTIONS.length - 1,
        total: TRIAL_QUESTIONS.length,
        toolScore: 4,
        toolTotal: 4,
      }),
    );
    expect(m.answers.find(a => a.id === 'outil-calcul')).toEqual(
      expect.objectContaining({
        ok: true,
        answer: 'calculate({"expression":"4817 * 2963"})',
      }),
    );
    expect(m.answers.find(a => a.id === 'capitale')).toEqual({
      id: 'capitale',
      ok: false,
      answer: 'Sydney',
    });
    // greedy, no reasoning: the same answer each time
    expect(e.completion.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        temperature: 0,
        enable_thinking: false,
        jinja: true,
      }),
    );
    // a tool question is asked as the chat asks it
    const calc = e.completion.mock.calls.find(
      ([p]: any) => p.messages.at(-1).content === 'Combien font 4817 × 2963 ?',
    )![0];
    expect(calc.messages[0].role).toBe('system');
    expect(calc.tools.map((t: any) => t.function.name)).toEqual(['calculate']);
  });

  it('gives a reasoning model room, and keeps what it wrote when nothing is left', async () => {
    const e = engine(GOOD);
    e.completion.mockImplementation((async ({messages, n_predict}: any) => {
      const prompt: string = messages[messages.length - 1].content;
      const q = TRIAL_QUESTIONS.find(x => x.prompt === prompt);
      if (!q) {
        return {text: 'Résumé.', content: 'Résumé.'};
      }
      if (q.id === 'capitale' && n_predict > q.maxTokens) {
        return {text: '<think>…</think>Canberra', content: 'Canberra'};
      }
      const text = q.id === 'pommes' ? '' : '<think>Voyons';
      return {text, content: text, tool_calls: GOOD_CALLS[q.id]};
    }) as any);
    const m = await runTrial(e, () => false);
    expect(m.answers.find(a => a.id === 'capitale')).toEqual(
      expect.objectContaining({ok: true, answer: 'Canberra'}),
    );
    expect(m.answers.find(a => a.id === 'auteur')).toEqual(
      expect.objectContaining({ok: false, answer: '', raw: '<think>Voyons'}),
    );
    // an empty answer without reasoning is not asked again
    const pommes = e.completion.mock.calls.filter(([p]: any) =>
      p.messages.at(-1).content.startsWith("J'ai 3 pommes"),
    );
    expect(pommes).toHaveLength(1);
  });

  it('stops between two questions when the user comes back', async () => {
    let calls = 0;
    await expect(runTrial(engine(GOOD), () => ++calls > 3)).rejects.toThrow(
      TrialInterrupted,
    );
  });
});
