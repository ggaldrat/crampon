import {
  TalentEngine,
  TalentExecuteContext,
  TalentResult,
  ToolDefinition,
} from './types';
import {fetchJson} from '../web/http';
import {truncateToTokens} from '../web/pageText';
import {CRAMPON_USER_AGENT} from '../web/userAgent';
import {getDeviceLocale} from '../tts/engines/system/voices';
import {wrapUntrusted} from './untrustedContent';
import {allowReadUrls} from './readUrlAllowlist';

const MAX_ARTICLES = 2;

interface WikiPage {
  title: string;
  extract?: string;
  fullurl?: string;
  /** Search rank (1 = best match). */
  index?: number;
}

interface WikiResponse {
  query?: {pages?: WikiPage[]};
}

/** Wikipedia language edition for the phone's language (`fr-FR` → `fr`). */
export const wikipediaLanguage = (locale: string): string => {
  const language = locale.toLowerCase().split('-')[0];
  return /^[a-z]{2,3}$/.test(language) ? language : 'en';
};

/**
 * Looks facts up on Wikipedia, queried directly from the phone through the
 * official MediaWiki API (no key, no relay): one request searches and returns
 * the introduction of the best matching articles.
 */
export class WikipediaEngine implements TalentEngine {
  readonly name = 'wikipedia';
  readonly recommendedContextTokens = 900;

  constructor(private getLocale: () => string = getDeviceLocale) {}

  async execute(
    args: Record<string, any>,
    ctx?: TalentExecuteContext,
  ): Promise<TalentResult> {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) {
      return {
        type: 'error',
        summary: 'wikipedia: missing or empty "query" argument',
        errorMessage:
          'query argument is required and must be a non-empty string',
      };
    }

    const lang = wikipediaLanguage(this.getLocale());
    // Built by hand: React Native's URLSearchParams is only partly implemented.
    const params = Object.entries({
      action: 'query',
      format: 'json',
      formatversion: '2',
      generator: 'search',
      gsrsearch: query,
      gsrlimit: String(MAX_ARTICLES),
      prop: 'extracts|info',
      exintro: '1',
      explaintext: '1',
      exlimit: String(MAX_ARTICLES),
      inprop: 'url',
    })
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');

    let data: WikiResponse;
    try {
      data = await fetchJson<WikiResponse>(
        `https://${lang}.wikipedia.org/w/api.php?${params}`,
        {
          method: 'GET',
          headers: {
            'User-Agent': CRAMPON_USER_AGENT,
            'Api-User-Agent': CRAMPON_USER_AGENT,
          },
          signal: ctx?.signal,
        },
      );
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return {
        type: 'error',
        summary: `wikipedia: ${errMsg}`,
        errorMessage: errMsg,
      };
    }

    const pages = (data.query?.pages ?? [])
      .filter(p => p.extract && p.extract.trim())
      .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
      .slice(0, MAX_ARTICLES);
    if (pages.length === 0) {
      return {
        type: 'text',
        summary: `wikipedia: no article found for "${query}". Say you could not find it rather than guessing.`,
      };
    }

    const perArticle = Math.floor(this.recommendedContextTokens / pages.length);
    const links = pages.map(p => p.fullurl).filter((u): u is string => !!u);
    allowReadUrls(links);

    const body = pages
      .map(
        p =>
          `${p.title}${p.fullurl ? `\n${p.fullurl}` : ''}\n${truncateToTokens(
            p.extract!.trim(),
            perArticle,
          )}`,
      )
      .join('\n\n');
    return {type: 'text', summary: wrapUntrusted(body), links};
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'wikipedia',
        description:
          'Look up facts on Wikipedia: people, places, events, works, concepts. Returns the introduction of the best matching articles. Use it instead of answering factual questions from memory.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'What to look up, in the language of the question (e.g. "Napoléon Ier").',
            },
          },
          required: ['query'],
        },
      },
    };
  }
}
