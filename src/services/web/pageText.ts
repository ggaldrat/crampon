/**
 * Turn a fetched HTML page into plain text on the phone, with no third-party
 * reader service. Deliberately simple: drop non-content elements, strip tags,
 * decode the common entities, collapse whitespace.
 */

export const URL_PATTERN = /https?:\/\/[^\s"'<>\]}]+/gi;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  agrave: 'à',
  acirc: 'â',
  ccedil: 'ç',
  ocirc: 'ô',
  ugrave: 'ù',
  ucirc: 'û',
  icirc: 'î',
  iuml: 'ï',
  euml: 'ë',
  laquo: '«',
  raquo: '»',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  ndash: '–',
  mdash: '—',
};

export const decodeEntities = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1] === 'x' || code[1] === 'X'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff
        ? String.fromCodePoint(n)
        : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });

const DROPPED_ELEMENTS =
  /<(script|style|noscript|svg|nav|header|footer|aside|form|template|iframe)\b[\s\S]*?<\/\1>/gi;

export interface PageText {
  title?: string;
  text: string;
  /** Absolute http(s) links found in the page, for the read_url allowlist. */
  links: string[];
}

export const htmlToText = (html: string, baseUrl: string): PageText => {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch
    ? decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim()
    : undefined;

  const links: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(decodeEntities(m[1]), baseUrl);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        links.push(url.toString());
      }
    } catch {
      // ignore unparsable hrefs
    }
  }

  const text = decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(DROPPED_ELEMENTS, ' ')
      .replace(/<(br|p|div|li|h[1-6]|tr|section|article)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();

  return {title: title || undefined, text, links};
};

/** ~4 chars per token (rough heuristic). */
const CHARS_PER_TOKEN = 4;

/** Cut on a word boundary so the model never sees a half word. */
export const truncateToTokens = (text: string, maxTokens: number): string => {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) {
    return text;
  }
  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
};
