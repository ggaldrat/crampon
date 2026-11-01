import {
  assembleMessages,
  CRAMPON_SYSTEM_PROMPT,
  resolveSystemPrompt,
  resolveSystemMessages,
} from '../systemPromptResolver';
import type {Model} from '../types';

describe('systemPromptResolver', () => {
  describe('resolveSystemPrompt', () => {
    it("returns Crampon's identity, whatever the model's template prompt", () => {
      const model = {
        chatTemplate: {systemPrompt: 'You are a helpful assistant.'},
      } as unknown as Model;
      expect(resolveSystemPrompt({model})).toBe(CRAMPON_SYSTEM_PROMPT);
      expect(resolveSystemPrompt({model: null})).toBe(CRAMPON_SYSTEM_PROMPT);
      expect(CRAMPON_SYSTEM_PROMPT).toContain('Crampon');
    });
  });

  describe('resolveSystemMessages', () => {
    it('returns the Crampon prompt as a single system message', () => {
      expect(resolveSystemMessages({model: null})).toEqual([
        {role: 'system', content: CRAMPON_SYSTEM_PROMPT},
      ]);
    });
  });

  describe('assembleMessages', () => {
    const sys = (content: string) => ({role: 'system' as const, content});
    const user = {role: 'user' as const, content: 'hello'};

    it('folds the system prompt and every fragment into one leading system message', () => {
      const result = assembleMessages(
        [sys('Pal prompt')],
        ['FRAGMENT-A', 'FRAGMENT-B'],
        [user],
      );

      expect(result).toEqual([
        {role: 'system', content: 'Pal prompt\n\nFRAGMENT-A\n\nFRAGMENT-B'},
        user,
      ]);
    });

    it('emits the fragments as the sole system message when there is no system prompt', () => {
      const result = assembleMessages([], ['FRAGMENT'], [user]);

      expect(result).toEqual([{role: 'system', content: 'FRAGMENT'}, user]);
    });

    it('leaves the system prompt untouched when no talent contributes a fragment', () => {
      const result = assembleMessages([sys('Pal prompt')], [], [user]);

      expect(result).toEqual([{role: 'system', content: 'Pal prompt'}, user]);
    });

    it('drops empty and whitespace-only parts', () => {
      const result = assembleMessages([sys('   ')], ['', '  ', 'REAL'], [user]);

      expect(result).toEqual([{role: 'system', content: 'REAL'}, user]);
    });

    it('produces no system message when there is nothing to say', () => {
      expect(assembleMessages([], [], [user])).toEqual([user]);
    });

    it('keeps the single system message leading, ahead of the conversation', () => {
      const history = [
        {role: 'assistant' as const, content: 'earlier reply'},
        user,
      ];
      const result = assembleMessages(
        [sys('Pal prompt')],
        ['FRAGMENT'],
        history,
      );

      expect(result[0]).toEqual({
        role: 'system',
        content: 'Pal prompt\n\nFRAGMENT',
      });
      expect(result.slice(1)).toEqual(history);
      expect(result.filter(msg => msg.role === 'system')).toHaveLength(1);
    });
  });
});
