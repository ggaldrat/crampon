/**
 * Hardcoded general-purpose models the onboarding installs when no device
 * rule preset resolved (see Onboarding6Screen.pickModel). Each entry is
 * self-describing so it can be lazy-registered into `modelStore.models` via
 * `ModelStore.registerOnboardingModel`.
 */

export type OnboardingModelTier = 'quick' | 'balanced' | 'best';

export interface OnboardingModelEntry {
  tier: OnboardingModelTier;
  recommended: boolean;
  /** `author/repo-name` (HF repo identifier). */
  repo: string;
  /** GGUF filename within the repo. */
  filename: string;
  /** Derived from `repo.split('/')[0]`. */
  author: string;
  /** Deterministic `huggingface.co/<repo>/resolve/main/<filename>`. */
  downloadUrl: string;
  displayName: string;
  sizeBytes: number;
  /** Model parameter count → `Model.params`. */
  params: number;
}

/**
 * Derived entry id — matches `Model.id` shape from both `hfAsModel`
 * (`${hfModel.id}/${modelFile.rfilename}`) and `defaultModels.ts`
 * preset ids.
 */
export const entryId = (entry: {repo: string; filename: string}): string =>
  `${entry.repo}/${entry.filename}`;

const modelEntry = (
  input: Omit<OnboardingModelEntry, 'author' | 'downloadUrl'>,
): OnboardingModelEntry => ({
  ...input,
  author: input.repo.split('/')[0],
  downloadUrl: `https://huggingface.co/${input.repo}/resolve/main/${input.filename}`,
});

export const FALLBACK_MODELS: readonly OnboardingModelEntry[] = [
  modelEntry({
    tier: 'quick',
    recommended: false,
    repo: 'LiquidAI/LFM2.5-1.2B-Instruct-GGUF',
    filename: 'LFM2.5-1.2B-Instruct-Q4_K_M.gguf',
    params: 1170340608,
    displayName: 'LFM2.5 1.2B',
    sizeBytes: 730895168,
  }),
  modelEntry({
    tier: 'balanced',
    recommended: true,
    repo: 'lmstudio-community/gemma-3-1b-it-GGUF',
    filename: 'gemma-3-1b-it-Q8_0.gguf',
    params: 999885952,
    displayName: 'Gemma 3 1B',
    sizeBytes: 1069306368,
  }),
  modelEntry({
    tier: 'best',
    recommended: false,
    repo: 'lmstudio-community/Qwen3.5-4B-GGUF',
    filename: 'Qwen3.5-4B-Q4_K_M.gguf',
    params: 4205751296,
    displayName: 'Qwen3.5 4B',
    sizeBytes: 2707513696,
  }),
];
