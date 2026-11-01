import {ReadUrlEngine} from '../ReadUrlEngine';
import {
  allowReadUrls,
  resetReadUrlAllowlist,
  seedReadUrlAllowlist,
} from '../readUrlAllowlist';
import {htmlToText} from '../../web/pageText';

const okText = (body: string) =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: {get: () => null},
    text: () => Promise.resolve(body),
  });

const PAGE = `<html><head><title>Le &eacute;t&eacute; &amp; la mer</title>
<style>body{color:red}</style><script>alert(1)</script></head>
<body><nav>Menu</nav><h1>Titre</h1><p>Premier&nbsp;paragraphe.</p>
<p>Voir <a href="/suite">la suite</a>.</p><footer>Pied</footer></body></html>`;

describe('htmlToText', () => {
  it('keeps the readable text and drops scripts, styles and chrome', () => {
    const page = htmlToText(PAGE, 'https://exemple.fr/article');
    expect(page.title).toBe('Le été & la mer');
    expect(page.text).toContain('Titre');
    expect(page.text).toContain('Premier paragraphe.');
    expect(page.text).not.toMatch(/alert|color:red|Menu|Pied/);
    expect(page.links).toEqual(['https://exemple.fr/suite']);
  });
});

describe('ReadUrlEngine', () => {
  const fetchMock = jest.fn();
  const engine = new ReadUrlEngine();

  beforeEach(() => {
    resetReadUrlAllowlist();
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
  });

  it('fetches a page the user named, directly, and returns its text', async () => {
    seedReadUrlAllowlist(
      [{role: 'user', content: 'Résume https://exemple.fr/article'}],
      [],
    );
    fetchMock.mockReturnValueOnce(okText(PAGE));

    const result = await engine.execute({url: 'https://exemple.fr/article'});

    expect(fetchMock.mock.calls[0][0]).toBe('https://exemple.fr/article');
    expect(result.type).toBe('text');
    expect(result.summary).toContain('Premier paragraphe.');
    expect(result.summary).toContain('UNTRUSTED WEB CONTENT');
  });

  it('refuses a URL nobody gave (exfiltration guard)', async () => {
    const result = await engine.execute({
      url: 'https://evil.example/?q=secret',
    });
    expect(result.type).toBe('error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('follows a link from an article already read', async () => {
    allowReadUrls(['https://fr.wikipedia.org/wiki/Paris']);
    fetchMock.mockReturnValueOnce(okText('<p>Capitale de la France.</p>'));
    const result = await engine.execute({
      url: 'https://fr.wikipedia.org/wiki/Paris',
    });
    expect(result.type).toBe('text');
  });

  it('reports fetch failures', async () => {
    allowReadUrls(['https://exemple.fr/']);
    fetchMock.mockReturnValueOnce(
      Promise.resolve({ok: false, status: 404, headers: {get: () => null}}),
    );
    const result = await engine.execute({url: 'https://exemple.fr/'});
    expect(result.type).toBe('error');
  });
});
