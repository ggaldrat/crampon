/**
 * Onboarding types — closed union of topic keys and the in-memory state
 * shape for the (now screen-less, zero-click) onboarding flow.
 *
 * `OnboardingState` lives inside `UIStore` (single store; per-session,
 * not persisted) — see `UIStore.onboardingState`. `hasCompletedOnboarding`
 * and `onboardingTopicsSnapshot` are persisted there too.
 *
 * There is no onboarding screen or topic-picker any more —
 * `useAutoModelSetup` runs silently on first launch and
 * `selectedTopic` stays `null` for the life of the app.
 */

export type TopicKey =
  | 'smartchat'
  | 'coding'
  | 'education'
  | 'roleplay'
  | 'creative_writing'
  | 'else';

export const TOPIC_KEYS: readonly TopicKey[] = [
  'smartchat',
  'coding',
  'education',
  'roleplay',
  'creative_writing',
  'else',
] as const;

export interface OnboardingState {
  selectedTopic: TopicKey | null;
  selectedModelId: string | null;
}

export const INITIAL_ONBOARDING_STATE: OnboardingState = {
  selectedTopic: null,
  selectedModelId: null,
};
