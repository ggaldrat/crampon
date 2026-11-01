import {TalentUIRegistry} from '../TalentUIRegistry';

describe('TalentUIRegistry', () => {
  it('registers and retrieves UIs by name', () => {
    const reg = new TalentUIRegistry();
    const ui = {name: 'render_html'};
    reg.register(ui);
    expect(reg.has('render_html')).toBe(true);
    expect(reg.get('render_html')).toBe(ui);
  });

  it('returns undefined for unknown names', () => {
    const reg = new TalentUIRegistry();
    expect(reg.get('no_such_talent')).toBeUndefined();
    expect(reg.has('no_such_talent')).toBe(false);
  });

  it('overwrites UIs registered under the same name (last wins)', () => {
    const reg = new TalentUIRegistry();
    const a = {name: 'render_html'};
    const b = {name: 'render_html'};
    reg.register(a);
    reg.register(b);
    expect(reg.get('render_html')).toBe(b);
  });

  it('reset() clears all UIs', () => {
    const reg = new TalentUIRegistry();
    reg.register({name: 'render_html'});
    reg.reset();
    expect(reg.has('render_html')).toBe(false);
  });
});
