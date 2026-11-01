import type {Model} from './types';

export interface SystemPromptDependencies {
  model?: Model | null;
}

// Crampon is the app's single assistant; this identity replaces the model's
// chat-template default (as the former default Pip pal did).
export const CRAMPON_SYSTEM_PROMPT =
  "You are Crampon, a friendly and helpful assistant that runs entirely on the user's phone, without sending anything to the internet. Keep replies concise and clear. Answer in the language the user writes in.";

/**
 * Resolves the system prompt: Crampon's identity. The model is kept as a
 * dependency so a per-model prompt can be layered in later.
 */
export function resolveSystemPrompt(
  _dependencies: SystemPromptDependencies,
): string {
  return CRAMPON_SYSTEM_PROMPT;
}

type ChatMessage = {role: string; content?: unknown};

/**
 * Fold the system prompt + every talent fragment into ONE leading system
 * message; a second system message makes strict chat templates raise.
 */
export function assembleMessages(
  systemMessages: Array<{role: 'system'; content: string}>,
  systemPromptFragments: string[],
  followingMessages: ChatMessage[],
): ChatMessage[] {
  const parts = [
    ...systemMessages.map(msg => msg.content),
    ...systemPromptFragments,
  ].filter(part => part.trim().length > 0);

  const leadingSystemMessage: ChatMessage[] = parts.length
    ? [{role: 'system', content: parts.join('\n\n')}]
    : [];

  const messages = [...leadingSystemMessage, ...followingMessages];

  if (__DEV__) {
    const systemPositions = messages
      .map((msg, index) => (msg.role === 'system' ? index : -1))
      .filter(index => index >= 0);
    if (
      systemPositions.length > 1 ||
      (systemPositions.length === 1 && systemPositions[0] !== 0)
    ) {
      console.error(
        'assembleMessages: chat templates require at most one leading system ' +
          `message, but found system messages at [${systemPositions.join(', ')}].`,
      );
    }
  }

  return messages;
}

/**
 * Resolves system prompt and formats it as a system message array
 * Returns empty array if no system prompt is available
 */
export function resolveSystemMessages(
  dependencies: SystemPromptDependencies,
): Array<{role: 'system'; content: string}> {
  const systemPrompt = resolveSystemPrompt(dependencies);

  if (!systemPrompt.trim()) {
    return [];
  }

  return [
    {
      role: 'system' as const,
      content: systemPrompt,
    },
  ];
}
