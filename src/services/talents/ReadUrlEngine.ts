import {
  TalentEngine,
  TalentExecuteContext,
  TalentResult,
  ToolDefinition,
} from './types';
import {fetchText} from '../web/http';
import {htmlToText, truncateToTokens} from '../web/pageText';
import {CRAMPON_USER_AGENT} from '../web/userAgent';
import {wrapUntrusted} from './untrustedContent';
import {allowReadUrls, matchReadUrl} from './readUrlAllowlist';

const MAX_PAGE_LINKS = 100;

/**
 * Reads one web page directly from the phone (no relay, no third-party
 * reader) and hands the model its plain text.
 */
export class ReadUrlEngine implements TalentEngine {
  readonly name = 'read_url';
  readonly recommendedContextTokens = 1200;

  async execute(
    args: Record<string, any>,
    ctx?: TalentExecuteContext,
  ): Promise<TalentResult> {
    const url = typeof args.url === 'string' ? args.url.trim() : '';
    if (!url) {
      return {
        type: 'error',
        summary: 'read_url: missing or empty "url" argument',
        errorMessage: 'url argument is required and must be a non-empty string',
      };
    }

    // Exfiltration guard: only pages on a site the user named, or links
    // found in a page or Wikipedia article already read in this chat.
    const targetUrl = matchReadUrl(url);
    if (targetUrl === null) {
      const summary =
        'read_url: this URL is not allowed. Read a page on a site the user named, or copy a URL exactly from a page or article you already read; do not invent URLs.';
      return {type: 'error', summary, errorMessage: summary};
    }

    let html: string;
    try {
      html = await fetchText(targetUrl, {
        method: 'GET',
        headers: {'User-Agent': CRAMPON_USER_AGENT},
        signal: ctx?.signal,
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return {
        type: 'error',
        summary: `read_url: ${errMsg}`,
        errorMessage: errMsg,
      };
    }

    const page = htmlToText(html, targetUrl);
    const text = truncateToTokens(page.text, this.recommendedContextTokens);
    if (!text) {
      const summary = `read_url: no readable content at ${targetUrl}`;
      return {type: 'error', summary, errorMessage: summary};
    }

    const links = page.links.slice(0, MAX_PAGE_LINKS);
    allowReadUrls(links);

    const header = page.title ? `${page.title}\n${targetUrl}` : targetUrl;
    return {
      type: 'text',
      summary: wrapUntrusted(`${header}\n\n${text}`),
      links,
    };
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'read_url',
        description:
          'Fetch the text of one web page. Use it when the user gives a URL or names a site. Copy URLs exactly; do not invent them.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description:
                'A page on a site the user named, or a URL copied exactly from a page you read.',
            },
          },
          required: ['url'],
        },
      },
    };
  }
}
