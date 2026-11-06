import type {ToolCall} from '../../utils/completionTypes';

/**
 * Crampon: the questions a candidate model answers on the phone before it can
 * become the chat model (see ModelTrialStore). Each answer is checked
 * automatically: facts, arithmetic, following an instruction, a structured
 * answer, plain French, and calling the app's tools.
 */
export type TrialQuestion = {
  id: string;
  prompt: string;
  /** Tokens allowed for the answer. */
  maxTokens: number;
  /** Asked with the app's tools (calculate, datetime, wikipedia...) offered. */
  tools?: boolean;
  check: (answer: string, toolCalls: ToolCall[]) => boolean;
};

const has = (answer: string, ...patterns: RegExp[]) =>
  patterns.every(p => p.test(answer));

/** The JSON object in an answer, wrapped in a code block or not. */
const jsonIn = (answer: string): Record<string, unknown> | null => {
  const match = answer.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
};

const FRENCH_WORDS = /\b(le|la|les|des|est|une|qui|dans|par|pour|que|et)\b/gi;
const ENGLISH_WORDS = /\b(the|is|are|and|which|because|of|light)\b/gi;

export const TRIAL_QUESTIONS: TrialQuestion[] = [
  {
    id: 'capitale',
    prompt: "Quelle est la capitale de l'Australie ? Réponds en un mot.",
    maxTokens: 24,
    check: a => has(a, /canberra/i),
  },
  {
    id: 'multiplication',
    prompt: 'Combien font 17 × 23 ? Donne seulement le nombre.',
    maxTokens: 24,
    check: a => has(a, /\b391\b/),
  },
  {
    id: 'pommes',
    prompt:
      "J'ai 3 pommes, j'en mange une, puis j'en achète 5. Combien de pommes ai-je ? Donne seulement le nombre.",
    maxTokens: 24,
    check: a => has(a, /\b7\b/) && !/\b(6|8|9)\b/.test(a),
  },
  {
    id: 'auteur',
    prompt: 'Qui a écrit « Les Misérables » ? Réponds par le nom de l’auteur.',
    maxTokens: 24,
    check: a => has(a, /hugo/i),
  },
  {
    id: 'fleuve',
    prompt: 'Quel est le plus long fleuve entièrement français ? Un mot.',
    maxTokens: 24,
    check: a => has(a, /loire/i),
  },
  {
    id: 'oui-non',
    prompt:
      'Réponds uniquement par oui ou par non : la Lune est-elle plus grande que la Terre ?',
    maxTokens: 16,
    check: a => /^\W*non\b/i.test(a),
  },
  {
    id: 'envers',
    prompt:
      'Écris le mot « bonjour » à l’envers, en minuscules, sans rien d’autre.',
    maxTokens: 16,
    check: a => has(a, /ruojnob/i),
  },
  {
    id: 'traduction',
    prompt: 'Traduis en anglais : « Le chat dort sur le canapé. »',
    maxTokens: 40,
    check: a => has(a, /\bcat\b/i, /\b(sofa|couch)\b/i, /sleep/i),
  },
  {
    id: 'json',
    prompt:
      'Donne un objet JSON avec les clés "ville" et "pays" pour la ville de Lyon. Réponds uniquement avec le JSON.',
    maxTokens: 48,
    check: a => {
      const o = jsonIn(a);
      return (
        !!o &&
        /lyon/i.test(String(o.ville ?? '')) &&
        /france/i.test(String(o.pays ?? ''))
      );
    },
  },
  {
    id: 'liste',
    prompt:
      'Cite les trois couleurs primaires en peinture, séparées par des virgules, sans autre texte.',
    maxTokens: 32,
    check: a =>
      has(a, /jaune/i, /(bleu|cyan)/i, /(rouge|magenta)/i) && a.length < 80,
  },
  {
    id: 'explication',
    prompt: 'Explique en deux phrases pourquoi le ciel est bleu.',
    maxTokens: 160,
    check: a => {
      const fr = a.match(FRENCH_WORDS)?.length ?? 0;
      const en = a.match(ENGLISH_WORDS)?.length ?? 0;
      // the right reason, not only the words of the question
      return fr >= 4 && fr > 2 * en && /diffus/i.test(a);
    },
  },
  {
    id: 'inspecteur',
    prompt: "Qui est l'inspecteur Gadget ? Réponds en une phrase.",
    maxTokens: 80,
    check: a =>
      /(dessin anim|s[ée]rie|personnage|cartoon)/i.test(a) &&
      /(gadget|d[ée]tective|inspecteur|policier)/i.test(a),
  },
  // Asked as the chat asks them: the tools its router picks for the question,
  // the system prompt and the tools' instructions (see runTrial).
  {
    id: 'outil-calcul',
    prompt: 'Combien font 4817 × 2963 ?',
    maxTokens: 96,
    tools: true,
    check: (_a, calls) =>
      calls.some(
        c =>
          c.function.name === 'calculate' &&
          /4817/.test(argument(c, 'expression')) &&
          /2963/.test(argument(c, 'expression')),
      ),
  },
  {
    id: 'outil-heure',
    prompt: 'Quelle heure est-il à Tokyo ?',
    maxTokens: 96,
    tools: true,
    check: (_a, calls) =>
      calls.some(
        c =>
          c.function.name === 'datetime' &&
          /tokyo/i.test(argument(c, 'timezone')),
      ),
  },
  {
    id: 'outil-wikipedia',
    prompt: 'Cherche sur Wikipédia : qui était Marie Curie ?',
    maxTokens: 96,
    tools: true,
    check: (_a, calls) =>
      calls.some(
        c =>
          c.function.name === 'wikipedia' &&
          /curie/i.test(argument(c, 'query')),
      ),
  },
  {
    id: 'outil-aucun',
    prompt: "Qu'est-ce que tu peux faire pour moi ? Réponds en une phrase.",
    maxTokens: 80,
    tools: true,
    // the router offers wikipedia here, but no tool is needed
    check: (a, calls) => calls.length === 0 && a.length > 10,
  },
];

/** One argument of a tool call; '' when the arguments are not valid JSON. */
function argument(call: ToolCall, name: string): string {
  try {
    return String(JSON.parse(call.function.arguments)[name] ?? '');
  } catch {
    return '';
  }
}

/** A long prompt for the speed test: about 400 tokens of French text. */
export const SPEED_PROMPT = `Voici un texte. Résume-le en trois phrases.

${'Le mont Blanc est le plus haut sommet des Alpes. Les alpinistes le gravissent depuis la fin du XVIIIe siècle, quand Jacques Balmat et Michel Paccard atteignirent son sommet en 1786. Aujourd’hui, des milliers de personnes tentent chaque été l’ascension, par des voies plus ou moins difficiles, et les refuges accueillent les cordées avant l’aube. '.repeat(
  4,
)}`;

/** Without the reasoning some models write before their answer. */
export const stripThinking = (text: string): string =>
  text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();
