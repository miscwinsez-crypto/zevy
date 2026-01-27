import axios from 'axios';
import { getGroqApiKey } from './groq-keys';
import {
  googleApiKey1,
  googleSearchEngineId,
  newsApiKey1,
  newsApiKey2,
} from './env';

interface WebSearchResult {
  title: string;
  snippet: string;
  link: string;
}

interface WebPageContent {
  url: string;
  title: string;
  content: string;
}

export class GroqCompound {
  private apiKey: string;

  constructor() {
    this.apiKey = getGroqApiKey();
  }

  async webSearch(query: string): Promise<WebSearchResult[]> {
    try {
      if (!googleApiKey1 || !googleSearchEngineId) {
        return this.fallbackWebSearch(query);
      }

      const response = await axios.get(
        'https://www.googleapis.com/customsearch/v1',
        {
          params: {
            key: googleApiKey1,
            cx: googleSearchEngineId,
            q: query,
            num: 10,
          },
        }
      );

      return (
        response.data.items?.map((item: any) => ({
          title: item.title,
          snippet: item.snippet,
          link: item.link,
        })) || []
      );
    } catch (error) {
      console.error('Web search error:', error);
      return this.fallbackWebSearch(query);
    }
  }

  private async fallbackWebSearch(query: string): Promise<WebSearchResult[]> {
    const wikipediaResults = await this.searchWikipedia(query);
    return wikipediaResults.map((item) => ({
      title: item.title,
      snippet: item.snippet.replace(/<[^>]+>/g, ''), // Remove HTML tags from snippet
      link: `https://en.wikipedia.org/?curid=${item.pageid}`,
    }));
  }

  async visitWebsite(url: string): Promise<WebPageContent> {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Zevy-AI-Bot/1.0)',
        },
      });

      const raw = response.data;

      if (typeof raw !== 'string') {
        return {
          url,
          title: 'Non-text content',
          content: '',
        };
      }

      const html = raw;
      const title = this.extractTitle(html) || url;
      const content = this.extractTextContent(html);

      return {
        url,
        title,
        content: content.substring(0, 5000),
      };
    } catch (error) {
      console.error('Website visit error:', error);
      return {
        url,
        title: 'Error accessing website',
        content: 'Unable to access the specified website.',
      };
    }
  }

  private extractTitle(html: string): string {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : '';
  }

  private extractTextContent(html: string): string {
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<[^>]+>/g, ' ');
    text = text.replace(/\s+/g, ' ').trim();
    text = text.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, '');
    return text;
  }

  private resolveTimeZoneFromPrompt(prompt: string): { location: string; timeZone: string } | null {
    const p = prompt.toLowerCase();

    // Keep this small + high-signal. Add more mappings only when needed.
    const cityMap: Array<{ match: RegExp; location: string; timeZone: string }> = [
      { match: /\b(beijing|peking)\b/, location: 'Beijing', timeZone: 'Asia/Shanghai' },
      { match: /\b(shanghai)\b/, location: 'Shanghai', timeZone: 'Asia/Shanghai' },
      { match: /\b(tokyo)\b/, location: 'Tokyo', timeZone: 'Asia/Tokyo' },
      { match: /\b(singapore)\b/, location: 'Singapore', timeZone: 'Asia/Singapore' },
      { match: /\b(london)\b/, location: 'London', timeZone: 'Europe/London' },
      { match: /\b(new\s+york|nyc)\b/, location: 'New York', timeZone: 'America/New_York' },
      { match: /\b(los\s+angeles|la)\b/, location: 'Los Angeles', timeZone: 'America/Los_Angeles' },
      { match: /\b(sydney)\b/, location: 'Sydney', timeZone: 'Australia/Sydney' },
    ];

    for (const entry of cityMap) {
      if (entry.match.test(p)) return { location: entry.location, timeZone: entry.timeZone };
    }

    // Generic "in China" -> use China Standard Time (Asia/Shanghai)
    if (/\b(in\s+china|china\b)/.test(p)) {
      return { location: 'China', timeZone: 'Asia/Shanghai' };
    }

    return null;
  }

  private async tryGetWorldTime(userPrompt: string): Promise<any | null> {
    // Only attempt for time/date/timezone prompts.
    if (!/\b(time|timezone|current\s+time|what\s+time)\b/i.test(userPrompt)) {
      return null;
    }

    const resolved = this.resolveTimeZoneFromPrompt(userPrompt);
    if (!resolved) {
      return null;
    }

    try {
      const url = `https://worldtimeapi.org/api/timezone/${resolved.timeZone}`;
      const response = await axios.get(url, { timeout: 8000 });
      const data = response.data;

      return {
        type: 'time',
        title: `Current time in ${resolved.location}`,
        content: `datetime=${data.datetime}; utc_offset=${data.utc_offset}; timezone=${data.timezone}`,
        url,
      };
    } catch {
      return null;
    }
  }

  async searchWikipedia(query: string, lang: string = 'en'): Promise<any[]> {
    try {
      const response = await axios.get(
        `https://${lang}.wikipedia.org/w/api.php`,
        {
          params: {
            action: 'query',
            format: 'json',
            list: 'search',
            srsearch: query,
            srlimit: 10,
            srprop: 'snippet|title|pageid',
          },
        }
      );
      return response.data?.query?.search ?? [];
    } catch (error) {
      console.error('Wikipedia search error:', error);
      return [];
    }
  }

  async getWikipediaPage(
    pageId: number,
    lang: string = 'en'
  ): Promise<string> {
    try {
      const response = await axios.get(
        `https://${lang}.wikipedia.org/w/api.php`,
        {
          params: {
            action: 'query',
            format: 'json',
            prop: 'extracts',
            pageids: pageId,
            exintro: true,
            explaintext: true,
            exlimit: 1,
          },
        }
      );
      const page = response.data?.query?.pages?.[pageId];
      return page?.extract || '';
    } catch (error) {
      console.error('Wikipedia page fetch error:', error);
      return '';
    }
  }

  async searchWikidata(query: string): Promise<any[]> {
    try {
      const response = await axios.get(
        'https://www.wikidata.org/w/api.php',
        {
          params: {
            action: 'wbsearchentities',
            format: 'json',
            search: query,
            language: 'en',
            limit: 10,
          },
        }
      );
      return response.data?.search ?? [];
    } catch (error) {
      console.error('Wikidata search error:', error);
      return [];
    }
  }

  async searchDbpedia(query: string): Promise<any[]> {
    try {
      const response = await axios.get(
        'https://api.dbpedia-spotlight.org/en/annotate',
        {
          params: {
            text: query,
            confidence: 0.5,
          },
          headers: {
            Accept: 'application/json',
          },
        }
      );
      return response.data.Resources ?? [];
    } catch (error) {
      console.error('DBpedia search error:', error);
      return [];
    }
  }

  async searchNews(query: string): Promise<any[]> {
    try {
      const apiKeys = [newsApiKey1, newsApiKey2].filter(Boolean) as string[];

      if (apiKeys.length === 0) {
        console.error('No News API keys found');
        return [];
      }

      for (const apiKey of apiKeys) {
        try {
          const encodedQuery = encodeURIComponent(query);
          const url = `https://newsapi.org/v2/everything?q=${encodedQuery}&apiKey=${apiKey}&pageSize=10`;
          const response = await axios.get(url);
          const articles = response.data.articles;

          if (articles && articles.length > 0) {
            return articles;
          }
        } catch (error) {
          console.warn(
            `News API key ${apiKey.slice(0, 5)}... failed. Trying next key.`
          );
        }
      }

      return [];
    } catch (error) {
      console.error('News search error:', error);
      return [];
    }
  }

  async browseAndAnalyze(
    userPrompt: string,
    targetModel: string,
    forceSearch: boolean = false
  ): Promise<string> {
    const normalizedPrompt = userPrompt.toLowerCase();
    const isLyricsQuery =
      /song\s+that\s+goes\b/i.test(userPrompt) ||
      (/\b(lyrics?|lyric)\b/i.test(normalizedPrompt) &&
        /\b(song|track)\b/i.test(normalizedPrompt));

    const wantsDeepResultsMatch =
      normalizedPrompt.match(/\b(\d{1,3})\s*(results?|searches|search|websites?|pages?)\b/);
    const requestedDepth = wantsDeepResultsMatch
      ? Math.max(1, Math.min(100, parseInt(wantsDeepResultsMatch[1], 10) || 0))
      : 0;

    const wantsManySources =
      /\b(50|100)\s*(sources|results|websites?|pages?)\b/.test(normalizedPrompt);

    const wantsLatest =
      /\b(latest|current|up to date|this season|this year|today|right now|live)\b/.test(
        normalizedPrompt
      );

    const hasYearNumber =
      /\b(19[0-9]{2}|20[0-9]{2})\b/.test(normalizedPrompt);

    const isEngineerNameQuery =
      /\bwho\b.*\b(engineered|designed|built|developed|created)\b/.test(normalizedPrompt) ||
      /\bhuman names?\b/.test(normalizedPrompt) ||
      (normalizedPrompt.includes('smart tunnel') &&
        /\b(who|engineer|designer|architect|people|person|individuals|names?)\b/.test(
          normalizedPrompt
        ));

    const isSelfOrZevyQuery =
      /\b(zevy|adam zein ziqry)\b/.test(normalizedPrompt) ||
      /\bwho (made|created|built)\b.*\b(you|yourself|zevy)\b/.test(normalizedPrompt);

    const hasQuestionWord = /\b(what|when|where|why|how|who|which)\b/.test(normalizedPrompt);

    const hasSearchKeyword =
      /(search|find|lookup|look up|current|latest|news|recent|today|this week|what happened|happened|update|time|timezone|date|day|month|year|weather|forecast|temperature|humidity|stock|price|quote|score|standings|detailed|comprehensive|explain|analyze|compare|contrast|pros and cons|advantages|disadvantages|research|study|report)/i.test(
        userPrompt
      );

    const shouldSearch =
      !isSelfOrZevyQuery &&
      userPrompt.length > 10 &&
      (hasSearchKeyword ||
        hasQuestionWord ||
        isLyricsQuery ||
        isEngineerNameQuery ||
        requestedDepth > 0 ||
        wantsLatest ||
        hasYearNumber);

    if (!shouldSearch && !forceSearch) {
      return '';
    }

    try {
      const searchQuery = await this.generateSearchQuery(userPrompt);

      const [webResults, wikipediaResults, newsResults, wikidataResults, dbpediaResults] = await Promise.all([
        this.webSearch(searchQuery),
        this.searchWikipedia(searchQuery),
        this.searchNews(searchQuery),
        this.searchWikidata(searchQuery),
        this.searchDbpedia(searchQuery),
      ]);

      const allInformation: any[] = [];

      const timeSource = await this.tryGetWorldTime(userPrompt);
      if (timeSource) {
        allInformation.push(timeSource);
      }

      if (wikipediaResults.length > 0) {
        for (const wikiResult of wikipediaResults.slice(0, 2)) {
          const pageContent = await this.getWikipediaPage(wikiResult.pageid);
          allInformation.push({
            type: 'wikipedia',
            title: wikiResult.title,
            content: pageContent,
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(
              wikiResult.title
            )}`,
          });
        }
      }

      if (webResults.length > 0) {
        const baseWebLimit = isLyricsQuery ? 8 : wantsManySources ? 20 : 5;
        const effectiveDepth = requestedDepth > 0 ? requestedDepth : baseWebLimit;
        const webLimit = Math.min(
          webResults.length,
          isEngineerNameQuery ? Math.max(effectiveDepth, wantsManySources ? 20 : 10) : effectiveDepth,
          wantsManySources ? 100 : 50
        );

        for (const result of webResults.slice(0, webLimit)) {
          if (result.link !== '#') {
            const pageContent = await this.visitWebsite(result.link);
            allInformation.push({
              type: 'web',
              title: result.title,
              content: pageContent.content,
              url: result.link,
            });
          }
        }
      }

      if (!isLyricsQuery && newsResults.length > 0) {
        const newsLimit = wantsManySources || wantsLatest || hasYearNumber ? 10 : 3;
        for (const article of newsResults.slice(0, newsLimit)) {
          const sourceName = article.source?.name || 'Unknown';
          const description = article.description || '';
          const combined = description
            ? `${description} (reported by ${sourceName})`
            : `Reported by ${sourceName}`;

          allInformation.push({
            type: 'news',
            title: article.title,
            content: combined,
            url: article.url,
            publishedAt: article.publishedAt,
          });
        }
      }

      if (!isLyricsQuery && wikidataResults.length > 0) {
        const wikidataLimit = wantsManySources ? 5 : 2;
        for (const result of wikidataResults.slice(0, wikidataLimit)) {
          allInformation.push({
            type: 'wikidata',
            title: result.label,
            content: result.description,
            url: result.concepturi,
          });
        }
      }

      if (!isLyricsQuery && dbpediaResults.length > 0) {
        const dbpediaLimit = wantsManySources ? 5 : 3;
        for (const result of dbpediaResults.slice(0, dbpediaLimit)) {
          allInformation.push({
            type: 'dbpedia',
            title: result['@surfaceForm'],
            content: `DBpedia resource: ${result['@URI']}`,
            url: result['@URI'],
          });
        }
      }

      await this.ensureWikipediaVerification(userPrompt, allInformation);

      if (allInformation.length > 100) {
        allInformation.length = 100;
      }

      if (allInformation.length === 0) {
        return '';
      }

      const analysis = await this.analyzeContent(
        userPrompt,
        allInformation,
        targetModel
      );

      return analysis;
    } catch (error) {
      console.error('Vector browsing error:', error);
      return 'The web research engine had an internal error and could not load external web, news, or Wikipedia sources for this reply. Answer using your own knowledge and reasoning instead of live data.';
    }
  }

  private async generateSearchQuery(userPrompt: string): Promise<string> {
    const lyricsPattern =
      /(?:what(?:'s| is)?|whats)?\s*the\s+song\s+that\s+goes\s+(.+)/i;
    const genericLyricsPattern =
      /which\s+song\s+has\s+the\s+lyrics?\s+(.+)/i;

    const directMatch = userPrompt.match(lyricsPattern);
    const altMatch = userPrompt.match(genericLyricsPattern);
    const match = directMatch || altMatch;

    if (match && match[1]) {
      const rawSnippet = match[1].replace(/["'“”]/g, '').trim();
      const snippet =
        rawSnippet.length > 120 ? rawSnippet.substring(0, 120) : rawSnippet;
      if (snippet.length > 0) {
        return `"${snippet}" lyrics`;
      }
    }

    return userPrompt.length > 100 ? userPrompt.substring(0, 100) : userPrompt;
  }

  private async analyzeContent(
    userPrompt: string,
    allInformation: any[],
    targetModel: string
  ): Promise<string> {
    const normalizedPrompt = userPrompt.toLowerCase();
    const isLyricsQuery =
      normalizedPrompt.includes('song that goes') ||
      (/\b(lyrics?|lyric)\b/.test(normalizedPrompt) &&
        /\b(song|track)\b/.test(normalizedPrompt));

    const isSportsTableQuery =
      (/\b(table|standings|league table)\b/.test(normalizedPrompt) ||
        /\b(points table|points standings)\b/.test(normalizedPrompt)) &&
      /\b(premier league|la liga|laliga|serie a|bundesliga|ligue 1|eredivisie|championship)\b/.test(
        normalizedPrompt
      );

    const wikipediaItems = allInformation.filter(
      (info) => info.type && String(info.type).toLowerCase() === 'wikipedia'
    );
    const otherItems = allInformation.filter(
      (info) => !info.type || String(info.type).toLowerCase() !== 'wikipedia'
    );

    const formatItem = (info: any) => {
      let sourceInfo = `${String(info.type || 'unknown').toUpperCase()} - ${info.title}`;
      if (info.publishedAt) {
        sourceInfo += ` (${new Date(info.publishedAt).toLocaleDateString()})`;
      }
      const content = typeof info.content === 'string' ? info.content : '';
      sourceInfo += `\n${content.substring(0, 1500)}`;
      return sourceInfo;
    };

    const wikipediaSection =
      wikipediaItems.length > 0
        ? `Wikipedia Double-Check:
${wikipediaItems.map(formatItem).join('\n\n')}`
        : 'Wikipedia Double-Check:\nNo direct Wikipedia articles were retrieved yet.';

    const otherSourcesSection =
      otherItems.length > 0
        ? `Other Evidence (web search, news, Wikidata, DBpedia, and other open-data double checkers like CIA World Factbook, Rest Countries, NASA, Open Library, OpenStreetMap, and similar sources that do not require API keys):
${otherItems.map(formatItem).join('\n\n')}`
        : 'Other Evidence (web search, news, Wikidata, DBpedia, and open-data double checkers):\nNo additional sources were collected.';

    const extraGuidance = isLyricsQuery
      ? '\nFor this query, the user is trying to identify a song from partial lyrics. Use the web sources to look for exact or very close lyric matches across multiple pages. If you are not confident after checking all the evidence, clearly say you are not sure instead of guessing a random song title.'
      : isSportsTableQuery
      ? '\nFor this query, the user is asking about a football league table or standings. Use the most recent season and the latest available table you can find across all sources. Prefer sources that clearly show the current season (for example, 2025–26) or have very recent dates. If different pages disagree, prefer the sources that look official or most up to date, and always state which season and approximate update date your answer refers to.'
      : '';

    const context = `
User Question: ${userPrompt}

${wikipediaSection}

${otherSourcesSection}

Use Wikipedia as a verifier for core factual claims such as names, dates, locations, and definitions. When information from other sources conflicts with Wikipedia, prefer Wikipedia unless there is very clear, newer evidence from reputable news articles that explains the change. Synthesize all sources into one answer, but keep Wikipedia as the main double-check for correctness. Present the final answer in a clear, conversational manner and do not copy large chunks of text verbatim. Do not include raw URLs, "Source:" labels, or these metadata lines in your answer. If you mention a source, refer to it briefly in natural language (for example, "a Malaysian news article" or "the project operator's website") instead of listing links.${extraGuidance}`;

    return context;
  }

  private async ensureWikipediaVerification(
    userPrompt: string,
    allInformation: any[]
  ): Promise<void> {
    const normalized = userPrompt.toLowerCase();

    const mentionsDrainTunnel =
      /\b(tunnel|underground)\b.*\b(drain|stormwater|flood)\b/.test(normalized) ||
      /\b(drain|stormwater|flood)\b.*\b(tunnel|underground)\b/.test(normalized) ||
      normalized.includes('smart tunnel') ||
      normalized.includes('stormwater management and road tunnel') ||
      normalized.includes('drain tunnel system') ||
      normalized.includes('tunnel that turns into a drain');

    if (!mentionsDrainTunnel) {
      return;
    }

    const combinedContent = allInformation
      .map((info) => `${info.title || ''} ${info.content || ''}`.toLowerCase())
      .join(' ');

    if (
      combinedContent.includes('stormwater management and road tunnel') ||
      combinedContent.includes('smart tunnel') ||
      combinedContent.includes('kuala lumpur') ||
      combinedContent.includes('malaysia')
    ) {
      return;
    }

    const keywords = [
      'Stormwater Management and Road Tunnel',
      'SMART Tunnel',
      'Stormwater Management And Road Tunnel Kuala Lumpur',
    ];

    for (const term of keywords) {
      const wikiExtra = await this.searchWikipedia(term);
      if (!wikiExtra || wikiExtra.length === 0) {
        continue;
      }

      const top = wikiExtra[0];
      const pageContent = await this.getWikipediaPage(top.pageid);

      if (!pageContent) {
        continue;
      }

      allInformation.push({
        type: 'wikipedia',
        title: top.title,
        content: pageContent,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(top.title)}`,
      });

      break;
    }
  }
}
