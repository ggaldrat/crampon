import {TalentEngine} from './types';

/**
 * Name-keyed registry for talent engines.
 *
 * A run that advertises a talent (its tool schema) can invoke the engine
 * registered under that name.
 */
export class TalentRegistry {
  private engines = new Map<string, TalentEngine>();

  register(engine: TalentEngine): void {
    this.engines.set(engine.name, engine);
  }

  get(name: string): TalentEngine | undefined {
    return this.engines.get(name);
  }

  has(name: string): boolean {
    return this.engines.has(name);
  }

  /** Return all registered engines. */
  getAll(): TalentEngine[] {
    return Array.from(this.engines.values());
  }

  /** Test helper: clear all registered engines. */
  reset(): void {
    this.engines.clear();
  }
}

export const talentRegistry = new TalentRegistry();
