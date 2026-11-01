import {WikipediaEngine, wikipediaLanguage} from '../WikipediaEngine';
import {isReadUrlAllowed, resetReadUrlAllowlist} from '../readUrlAllowlist';

const okJson = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: {get: () => null},
    text: () => Promise.resolve(JSON.stringify(body)),
  });

describe('WikipediaEngine', () => {
  const fetchMock = jest.fn();
  const engine = new WikipediaEngine(() => 'fr-FR');

  beforeEach(() => {
    resetReadUrlAllowlist();
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
  });

  it('queries the phone-language edition directly and returns the intro', async () => {
    fetchMock.mockReturnValueOnce(
      okJson({
        query: {
          pages: [
            {
              title: 'Napoléon III',
              index: 2,
              extract: 'Neveu de Napoléon Ier.',
              fullurl: 'https://fr.wikipedia.org/wiki/Napol%C3%A9on_III',
            },
            {
              title: 'Napoléon Ier',
              index: 1,
              extract: 'Empereur des Français de 1804 à 1814.',
              fullurl: 'https://fr.wikipedia.org/wiki/Napol%C3%A9on_Ier',
            },
          ],
        },
      }),
    );

    const result = await engine.execute({query: 'Napoléon'});

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^https:\/\/fr\.wikipedia\.org\/w\/api\.php\?/);
    expect(url).toContain('gsrsearch=Napol%C3%A9on');
    expect(init.headers['Api-User-Agent']).toContain('Crampon');
    expect(result.type).toBe('text');
    // Best search rank first, wrapped as untrusted content
    expect(result.summary.indexOf('Napoléon Ier')).toBeLessThan(
      result.summary.indexOf('Napoléon III'),
    );
    expect(result.summary).toContain('Empereur des Français');
    expect(result.summary).toContain('UNTRUSTED WEB CONTENT');
    // Article URLs become readable with read_url
    expect(
      isReadUrlAllowed('https://fr.wikipedia.org/wiki/Napol%C3%A9on_Ier'),
    ).toBe(true);
  });

  it('tells the model to admit it found nothing', async () => {
    fetchMock.mockReturnValueOnce(okJson({}));
    const result = await engine.execute({query: 'zzqxw'});
    expect(result.type).toBe('text');
    expect(result.summary).toContain('no article found');
  });

  it('reports network errors', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network request failed'));
    const result = await engine.execute({query: 'Paris'});
    expect(result.type).toBe('error');
  });

  it('rejects an empty query', async () => {
    const result = await engine.execute({query: '  '});
    expect(result.type).toBe('error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps the locale to a Wikipedia edition', () => {
    expect(wikipediaLanguage('fr-FR')).toBe('fr');
    expect(wikipediaLanguage('en')).toBe('en');
    expect(wikipediaLanguage('')).toBe('en');
  });
});
