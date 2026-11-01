import {TalentRegistry} from '../TalentRegistry';
import {
  collectSystemPromptFragments,
  deriveToolSchemas,
  resetRegisteredFlag,
  talentRegistry,
} from '../index';
import type {TalentEngine} from '../types';

const fakeEngine = (name: string, fragment?: string): TalentEngine => ({
  name,
  execute: jest.fn(async () => ({type: 'text' as const, summary: name})),
  toToolDefinition: () => ({
    type: 'function',
    function: {
      name,
      description: `${name} tool`,
      parameters: {type: 'object', properties: {}},
    },
  }),
  ...(fragment ? {systemPromptFragment: () => fragment} : {}),
});

describe('TalentRegistry', () => {
  it('registers and retrieves engines by name', () => {
    const reg = new TalentRegistry();
    const engine = fakeEngine('echo');
    reg.register(engine);
    expect(reg.has('echo')).toBe(true);
    expect(reg.get('echo')).toBe(engine);
  });

  it('returns undefined for unknown names', () => {
    const reg = new TalentRegistry();
    expect(reg.get('no_such_talent')).toBeUndefined();
    expect(reg.has('no_such_talent')).toBe(false);
  });

  it('overwrites engines registered under the same name (last wins)', () => {
    const reg = new TalentRegistry();
    const a = fakeEngine('echo');
    const b = fakeEngine('echo');
    reg.register(a);
    reg.register(b);
    expect(reg.get('echo')).toBe(b);
  });

  it('reset() clears all engines', () => {
    const reg = new TalentRegistry();
    reg.register(fakeEngine('echo'));
    reg.reset();
    expect(reg.has('echo')).toBe(false);
  });
});

describe('talent helpers', () => {
  beforeEach(() => {
    talentRegistry.reset();
  });

  it('registers the four built-in talents on first use', () => {
    resetRegisteredFlag();
    expect(deriveToolSchemas().map(s => s.function.name)).toEqual([
      'calculate',
      'datetime',
      'wikipedia',
      'read_url',
    ]);
    talentRegistry.reset();
  });

  it('derives schemas for registered engines, filtered by name', () => {
    talentRegistry.register(fakeEngine('alpha'));
    talentRegistry.register(fakeEngine('beta'));
    expect(deriveToolSchemas().map(s => s.function.name)).toEqual([
      'alpha',
      'beta',
    ]);
    expect(
      deriveToolSchemas(['beta', 'unknown']).map(s => s.function.name),
    ).toEqual(['beta']);
  });

  it('collects non-empty fragments of the requested talents only', () => {
    talentRegistry.register(fakeEngine('alpha', 'use alpha'));
    talentRegistry.register(fakeEngine('beta', '   '));
    talentRegistry.register(fakeEngine('gamma', 'use gamma'));
    const ctx = {now: new Date(), maxToolTurns: 5};
    expect(collectSystemPromptFragments(['alpha', 'beta'], ctx)).toEqual([
      'use alpha',
    ]);
  });
});
