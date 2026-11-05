import {stripThinking, TRIAL_QUESTIONS} from '../questions';
import {runTrial, TrialInterrupted} from '../runTrial';

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
};

describe('trial questions', () => {
  it.each(TRIAL_QUESTIONS.map(q => [q.id, q] as const))(
    '%s: accepts a right answer and refuses a wrong one',
    (id, q) => {
      expect(q.check(GOOD[id])).toBe(true);
      expect(q.check(BAD[id])).toBe(false);
    },
  );

  it('drops the reasoning before checking', () => {
    expect(stripThinking('<think>17×23 = 391</think>\n391')).toBe('391');
    expect(stripThinking('<think>unfinished')).toBe('');
  });
});

describe('runTrial', () => {
  const engine = (answers: Record<string, string>) => ({
    completion: jest.fn(async ({messages}: any) => {
      const prompt: string = messages[0].content;
      const q = TRIAL_QUESTIONS.find(x => x.prompt === prompt);
      const text = q ? answers[q.id] : 'Résumé.';
      return {
        text,
        content: text,
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
      }),
    );
    expect(m.answers.find(a => a.id === 'capitale')).toEqual({
      id: 'capitale',
      ok: false,
      answer: 'Sydney',
    });
    // greedy, no reasoning: the same answer each time
    expect(e.completion.mock.calls[0][0]).toEqual(
      expect.objectContaining({temperature: 0, enable_thinking: false}),
    );
  });

  it('stops between two questions when the user comes back', async () => {
    let calls = 0;
    await expect(runTrial(engine(GOOD), () => ++calls > 3)).rejects.toThrow(
      TrialInterrupted,
    );
  });
});
