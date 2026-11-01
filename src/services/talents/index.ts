import {talentRegistry} from './TalentRegistry';
import type {ToolDefinition, SystemPromptContext} from './types';
import {CalculateEngine} from './CalculateEngine';
import {DatetimeEngine} from './DatetimeEngine';
import {ReadUrlEngine} from './ReadUrlEngine';
import {WikipediaEngine} from './WikipediaEngine';

// Crampon's tools all run from the phone: date and calculator locally,
// Wikipedia and page reading by direct requests (no relay server).
export {TalentRegistry, talentRegistry} from './TalentRegistry';
export {selectTalents} from './router';
export {seedReadUrlAllowlist, isReadUrlAllowed} from './readUrlAllowlist';
export {TalentUIRegistry, talentUIRegistry} from './TalentUIRegistry';
export type {TalentUI} from './TalentUIRegistry';
export type {
  TalentEngine,
  TalentResult,
  ToolDefinition,
  SystemPromptContext,
} from './types';

let registered = false;

/** Register the built-in engines. Idempotent. */
export function registerDefaultTalents(): void {
  if (registered) {
    return;
  }
  talentRegistry.register(new CalculateEngine());
  talentRegistry.register(new DatetimeEngine());
  talentRegistry.register(new WikipediaEngine());
  talentRegistry.register(new ReadUrlEngine());
  registered = true;
}

/** Test helper: let registerDefaultTalents() run again after a reset. */
export function resetRegisteredFlag(): void {
  registered = false;
}

/**
 * Derive OpenAI-format tool schemas from registered engines.
 *
 * When `talentNames` is provided, only engines matching those names are
 * included.
 */
export function deriveToolSchemas(talentNames?: string[]): ToolDefinition[] {
  registerDefaultTalents();
  const engines = talentRegistry.getAll();
  if (!talentNames) {
    return engines.map(engine => engine.toToolDefinition());
  }
  const wanted = new Set(talentNames);
  return engines
    .filter(engine => wanted.has(engine.name))
    .map(engine => engine.toToolDefinition());
}

/**
 * Fragments are folded into the single leading system message by
 * `assembleMessages`; a talent never emits its own system message.
 */
export function collectSystemPromptFragments(
  talentNames: string[],
  ctx: Omit<SystemPromptContext, 'activeTalents'>,
): string[] {
  registerDefaultTalents();
  const wanted = new Set(talentNames);
  const engineCtx: SystemPromptContext = {...ctx, activeTalents: wanted};
  return talentRegistry
    .getAll()
    .filter(engine => wanted.has(engine.name))
    .map(engine => engine.systemPromptFragment?.(engineCtx))
    .filter((fragment): fragment is string => !!fragment && !!fragment.trim());
}
