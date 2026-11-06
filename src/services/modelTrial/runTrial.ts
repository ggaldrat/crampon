import type {CompletionEngine, ToolCall} from '../../utils/completionTypes';
import {
  assembleMessages,
  CRAMPON_SYSTEM_PROMPT,
} from '../../utils/systemPromptResolver';
import {DEFAULT_MAX_TURNS} from '../agent/AgentRunner';
import {
  asksDateOrTime,
  collectSystemPromptFragments,
  deriveToolSchemas,
  deviceClockNote,
  selectTalents,
} from '../talents';

import {
  SPEED_PROMPT,
  stripThinking,
  TRIAL_QUESTIONS,
  TrialQuestion,
} from './questions';

export type TrialAnswer = {
  id: string;
  ok: boolean;
  answer: string;
  /** What the model wrote, when nothing is left once its reasoning is dropped. */
  raw?: string;
};

export type TrialMeasures = {
  /** Answer tokens per second, on the speed test. */
  decodeTps: number;
  /** Prompt tokens per second, on the speed test (about 400 tokens). */
  promptTps: number;
  /** Questions answered correctly, out of `total`. */
  score: number;
  total: number;
  /** Of which the tool questions. */
  toolScore: number;
  toolTotal: number;
  answers: TrialAnswer[];
  ms: number;
};

/** Stops the trial: the user came back to the app's chat. */
export class TrialInterrupted extends Error {}

/** Room given again to a model that spent its tokens reasoning. */
const REASONING_ROOM = 384;

/** The messages the chat would send for this question, tools included. */
const chatRequest = (q: {prompt: string; tools?: boolean}) => {
  if (!q.tools) {
    return {messages: [{role: 'user', content: q.prompt}]};
  }
  const talentNames = selectTalents(q.prompt);
  const now = new Date();
  const messages = assembleMessages(
    [{role: 'system', content: CRAMPON_SYSTEM_PROMPT}],
    [
      ...collectSystemPromptFragments(talentNames, {
        now,
        maxToolTurns: DEFAULT_MAX_TURNS,
      }),
      ...(asksDateOrTime(q.prompt) ? [deviceClockNote(now)] : []),
    ],
    [{role: 'user', content: q.prompt}],
  );
  return {messages, tools: deriveToolSchemas(talentNames)};
};

const toolCallText = (calls: ToolCall[]) =>
  calls.map(c => `${c.function.name}(${c.function.arguments})`).join(' ');

/**
 * Runs the speed test, then the questions, on the loaded model. Greedy
 * decoding, no reasoning, the chat's own template: the same answer every time
 * for a given model. `shouldStop` is checked between two completions.
 */
export const runTrial = async (
  engine: CompletionEngine,
  shouldStop: () => boolean,
  questions: TrialQuestion[] = TRIAL_QUESTIONS,
): Promise<TrialMeasures> => {
  const start = Date.now();
  const ask = async (
    q: {prompt: string; tools?: boolean},
    maxTokens: number,
  ) => {
    if (shouldStop()) {
      throw new TrialInterrupted();
    }
    const result = await engine.completion({
      ...chatRequest(q),
      n_predict: maxTokens,
      temperature: 0,
      jinja: true,
      enable_thinking: false,
      reasoning_format: 'auto',
    } as Parameters<CompletionEngine['completion']>[0]);
    const content = result.content || result.text || '';
    return {
      text: stripThinking(content),
      // everything generated, reasoning included
      raw: result.text || content,
      reasoned: !!result.reasoning_content || /<think>/.test(content),
      toolCalls: result.tool_calls ?? [],
      timings: result.timings,
    };
  };

  const speed = await ask({prompt: SPEED_PROMPT}, 128);
  const answers: TrialAnswer[] = [];
  let toolScore = 0;
  for (const q of questions) {
    let r = await ask(q, q.maxTokens);
    if (!r.text && !r.toolCalls.length && r.reasoned) {
      // reasoning despite enable_thinking: false ate the room for the answer
      r = await ask(q, q.maxTokens + REASONING_ROOM);
    }
    const ok = q.check(r.text, r.toolCalls);
    if (ok && q.tools) {
      toolScore++;
    }
    const answer = r.toolCalls.length
      ? `${toolCallText(r.toolCalls)} ${r.text}`.trim()
      : r.text;
    answers.push(
      answer
        ? {id: q.id, ok, answer}
        : {id: q.id, ok, answer, raw: r.raw.slice(0, 400)},
    );
  }
  return {
    decodeTps: speed.timings?.predicted_per_second ?? 0,
    promptTps: speed.timings?.prompt_per_second ?? 0,
    score: answers.filter(a => a.ok).length,
    total: questions.length,
    toolScore,
    toolTotal: questions.filter(q => q.tools).length,
    answers,
    ms: Date.now() - start,
  };
};
