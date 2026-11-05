import type {CompletionEngine} from '../../utils/completionTypes';

import {
  SPEED_PROMPT,
  stripThinking,
  TRIAL_QUESTIONS,
  TrialQuestion,
} from './questions';

export type TrialAnswer = {id: string; ok: boolean; answer: string};

export type TrialMeasures = {
  /** Answer tokens per second, on the speed test. */
  decodeTps: number;
  /** Prompt tokens per second, on the speed test (about 400 tokens). */
  promptTps: number;
  /** Questions answered correctly, out of `total`. */
  score: number;
  total: number;
  answers: TrialAnswer[];
  ms: number;
};

/** Stops the trial: the user came back to the app's chat. */
export class TrialInterrupted extends Error {}

/**
 * Runs the speed test, then the questions, on the loaded model. Greedy
 * decoding, no reasoning: the same answer every time for a given model.
 * `shouldStop` is checked between two completions.
 */
export const runTrial = async (
  engine: CompletionEngine,
  shouldStop: () => boolean,
  questions: TrialQuestion[] = TRIAL_QUESTIONS,
): Promise<TrialMeasures> => {
  const start = Date.now();
  const ask = async (prompt: string, maxTokens: number) => {
    if (shouldStop()) {
      throw new TrialInterrupted();
    }
    const result = await engine.completion({
      messages: [{role: 'user', content: prompt}],
      n_predict: maxTokens,
      temperature: 0,
      enable_thinking: false,
    });
    return {
      text: stripThinking(result.content || result.text || ''),
      timings: result.timings,
    };
  };

  const speed = await ask(SPEED_PROMPT, 128);
  const answers: TrialAnswer[] = [];
  for (const q of questions) {
    const {text} = await ask(q.prompt, q.maxTokens);
    answers.push({id: q.id, ok: q.check(text), answer: text});
  }
  return {
    decodeTps: speed.timings?.predicted_per_second ?? 0,
    promptTps: speed.timings?.prompt_per_second ?? 0,
    score: answers.filter(a => a.ok).length,
    total: questions.length,
    answers,
    ms: Date.now() - start,
  };
};
