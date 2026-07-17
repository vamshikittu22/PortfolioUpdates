/**
 * NEWS-01 — fixture-driven correctness proof for the feed-interpretation
 * layer: `parseGoogleNewsRss`, `parseRssFeed`, `parseFinnhubNews`.
 *
 * Run:  npx tsx scripts/news-parse-test.ts
 * (Already registered: npm run test:news-parse)
 *
 * Fixtures below are structurally modeled on the LIVE captures in
 * 06-RESEARCH-external.md §2 (Google News RSS) and §3 (ET Markets /
 * LiveMint publisher RSS) — same channel/item shape, attribute forms, and
 * CDATA wrapping observed live on 2026-07-17, with invented headlines.
 *
 * This is a PURE unit test — no database, no network, no env vars, no
 * Date.now()/randomness. Same dependency-free style as
 * scripts/news-dedupe-test.ts / scripts/news-match-test.ts:
 * node:assert/strict, console.log('PASS') + process.exit(0) on success,
 * throw / non-zero exit on failure.
 * Do NOT weaken these assertions to make the script pass — a failure means
 * the implementation is wrong; fix parse-feeds.ts instead.
 */
import assert from 'node:assert/strict';
import { parseGoogleNewsRss, parseRssFeed, parseFinnhubNews } from '../src/lib/news/parse-feeds';

// --- Fixture: Google News RSS search result, 2 items, structurally modeled
// on 06-RESEARCH-external.md §2's live capture ---
const GOOGLE_NEWS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
<title>&quot;Infosys&quot; - Google News</title>
<link>https://news.google.com/rss/search?q=Infosys</link>
<language>en-IN</language>
<item>
<title>Infosys shares rise on strong Q1 results - The Economic Times</title>
<link>https://news.google.com/rss/articles/CBMiVkFVX3lxTE5hbXBsZUZha2VJZFRva2VuMQ?oc=5</link>
<guid isPermaLink="false">CBMiVkFVX3lxTE5hbXBsZUZha2VJZFRva2VuMQ</guid>
<pubDate>Fri, 17 Jul 2026 05:25:44 GMT</pubDate>
<description>&lt;a href="https://news.google.com/rss/articles/CBMiVkFVX3lxTE5hbXBsZUZha2VJZFRva2VuMQ?oc=5" target="_blank"&gt;Infosys shares rise on strong Q1 results&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;The Economic Times&lt;/font&gt;</description>
<source url="https://m.economictimes.com">The Economic Times</source>
</item>
<item>
<title>TCS profit beats estimates on strong deal wins - Business Standard</title>
<link>https://news.google.com/rss/articles/CBMiV0FVX3lxTE9hbXBsZUZha2VJZFRva2VuMg?oc=5</link>
<guid isPermaLink="false">CBMiV0FVX3lxTE9hbXBsZUZha2VJZFRva2VuMg</guid>
<pubDate>Fri, 17 Jul 2026 06:10:12 GMT</pubDate>
<description>&lt;a href="x" target="_blank"&gt;TCS profit beats estimates on strong deal wins&lt;/a&gt;</description>
<source url="https://www.business-standard.com">Business Standard</source>
</item>
</channel>
</rss>`;

function testGoogleNewsRss(): void {
  const result = parseGoogleNewsRss(GOOGLE_NEWS_XML);
  assert.equal(result.error, null, 'Google fixture must parse without error');
  assert.equal(result.items.length, 2, 'Google fixture has 2 <item> elements');

  const [first, second] = result.items;

  assert.equal(
    first.title,
    'Infosys shares rise on strong Q1 results - The Economic Times',
    'Title keeps the raw " - Publisher" suffix — normalization is dedupe.ts\'s job, not the parser\'s'
  );
  assert.equal(
    first.url,
    'https://news.google.com/rss/articles/CBMiVkFVX3lxTE5hbXBsZUZha2VJZFRva2VuMQ?oc=5',
    'url is the Google redirect link, not a resolved publisher URL'
  );
  assert.equal(
    first.source,
    'The Economic Times',
    'source comes from the <source> element text, never hardcoded to "Google News"'
  );
  assert.equal(
    first.publishedAtIso,
    '2026-07-17T05:25:44.000Z',
    'RFC-822 GMT pubDate converts to the correct ISO-8601 UTC instant'
  );
  assert.equal(first.abstract, null, 'Google <description> is anchor soup — discarded, never surfaced');

  assert.equal(
    second.title,
    'TCS profit beats estimates on strong deal wins - Business Standard',
    'Second item title also keeps its raw suffix'
  );
  assert.equal(second.source, 'Business Standard', 'Second item source read from its own <source> element');
}

// --- Fixture: publisher RSS (ET Markets shape) — CDATA-wrapped fields,
// +0530 pubDate, 2 items ---
const PUBLISHER_RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title><![CDATA[ET Markets]]></title>
<link><![CDATA[https://economictimes.indiatimes.com/markets]]></link>
<item>
<title><![CDATA[Sensex rallies 500 points on strong global cues]]></title>
<link><![CDATA[https://economictimes.indiatimes.com/markets/stocks/news/sensex-rallies-500-points/articleshow/111111.cms]]></link>
<description><![CDATA[Sensex closed higher today led by banking and IT stocks amid firm global cues.]]></description>
<guid><![CDATA[https://economictimes.indiatimes.com/markets/stocks/news/sensex-rallies-500-points/articleshow/111111.cms]]></guid>
<pubDate>Fri, 17 Jul 2026 21:49:03 +0530</pubDate>
</item>
<item>
<title><![CDATA[RBI holds repo rate steady amid inflation concerns]]></title>
<link><![CDATA[https://economictimes.indiatimes.com/markets/stocks/news/rbi-holds-repo-rate/articleshow/222222.cms]]></link>
<description><![CDATA[The RBI's monetary policy committee kept the repo rate unchanged for a third straight meeting.]]></description>
<guid><![CDATA[https://economictimes.indiatimes.com/markets/stocks/news/rbi-holds-repo-rate/articleshow/222222.cms]]></guid>
<pubDate>Fri, 17 Jul 2026 22:15:30 +0530</pubDate>
</item>
</channel>
</rss>`;

function testPublisherRssFeed(): void {
  const result = parseRssFeed(PUBLISHER_RSS_XML, 'ET Markets');
  assert.equal(result.error, null, 'Publisher fixture must parse without error');
  assert.equal(result.items.length, 2, 'Publisher fixture has 2 <item> elements');

  const [first, second] = result.items;

  assert.equal(
    first.title,
    'Sensex rallies 500 points on strong global cues',
    'CDATA-wrapped title unwraps cleanly with no CDATA markers or entity soup'
  );
  assert.equal(
    first.url,
    'https://economictimes.indiatimes.com/markets/stocks/news/sensex-rallies-500-points/articleshow/111111.cms',
    'CDATA-wrapped link unwraps to the real publisher article URL'
  );
  assert.equal(first.source, 'ET Markets', 'source is the caller-passed feed name, not read from the XML');
  assert.equal(
    first.publishedAtIso,
    '2026-07-17T16:19:03.000Z',
    '+0530 pubDate converts to the correct UTC instant'
  );
  assert.equal(
    first.abstract,
    'Sensex closed higher today led by banking and IT stocks amid firm global cues.',
    'abstract is the CDATA-unwrapped description text'
  );

  assert.equal(second.title, 'RBI holds repo rate steady amid inflation concerns');
  assert.equal(second.source, 'ET Markets');
}

// --- Fixture: single-item publisher channel — the fast-xml-parser
// object-not-array pitfall (isArray must force this into a one-element array) ---
const SINGLE_ITEM_RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title><![CDATA[LiveMint Markets]]></title>
<item>
<title><![CDATA[Nifty ends flat as IT stocks weigh on gains]]></title>
<link><![CDATA[https://www.livemint.com/market/stock-market-news/nifty-ends-flat-333333.html]]></link>
<description><![CDATA[The Nifty 50 ended nearly unchanged as IT heavyweights offset gains in banking stocks.]]></description>
<guid><![CDATA[https://www.livemint.com/market/stock-market-news/nifty-ends-flat-333333.html]]></guid>
<pubDate>Fri, 17 Jul 2026 22:40:00 +0530</pubDate>
</item>
</channel>
</rss>`;

function testSingleItemChannelYieldsArray(): void {
  const result = parseRssFeed(SINGLE_ITEM_RSS_XML, 'LiveMint');
  assert.equal(result.error, null, 'Single-item fixture must parse without error');
  assert.equal(
    result.items.length,
    1,
    'A single-item channel must still yield a one-element ARRAY, not an unwrapped object'
  );
  assert.equal(result.items[0].title, 'Nifty ends flat as IT stocks weigh on gains');
}

// --- Fixture: Finnhub company-news JSON array, per the swagger CompanyNews
// definition (06-RESEARCH-external.md §1) ---
const FINNHUB_VALID_TIMESTAMP = 1784295044; // unix seconds

const FINNHUB_NEWS_JSON: unknown[] = [
  {
    category: 'company news',
    datetime: FINNHUB_VALID_TIMESTAMP,
    headline: 'Sample Company reports strong quarterly earnings',
    id: 111,
    image: 'https://example.com/thumb1.jpg',
    related: 'AAPL',
    source: 'Reuters',
    summary: 'Sample Company beat analyst estimates on both revenue and EPS this quarter.',
    url: 'https://example.com/article1',
  },
  {
    category: 'company news',
    datetime: FINNHUB_VALID_TIMESTAMP + 3600,
    headline: 'Sample Company announces new product line',
    id: 112,
    image: '',
    related: 'AAPL',
    source: 'Bloomberg',
    summary: '', // empty summary must become null abstract, never an empty string
    url: 'https://example.com/article2',
  },
  {
    // missing headline entirely — must be skipped, not fabricated
    category: 'company news',
    datetime: FINNHUB_VALID_TIMESTAMP + 7200,
    id: 113,
    image: '',
    related: 'AAPL',
    source: 'CNBC',
    summary: 'This entry has no headline and must not appear in the output.',
    url: 'https://example.com/article3',
  },
  {
    // missing url entirely — must be skipped, not fabricated
    category: 'company news',
    datetime: FINNHUB_VALID_TIMESTAMP + 10800,
    headline: 'Missing URL entry should be skipped',
    id: 114,
    image: '',
    related: 'AAPL',
    source: 'CNBC',
    summary: 'This entry has no url and must not appear in the output.',
  },
];

function testFinnhubNewsValid(): void {
  const result = parseFinnhubNews(FINNHUB_NEWS_JSON);
  assert.equal(result.error, null, 'Finnhub fixture must parse without error');
  assert.equal(
    result.items.length,
    2,
    'Only the 2 well-formed entries survive — malformed entries are skipped honestly, not fabricated'
  );

  const [first, second] = result.items;

  assert.equal(first.title, 'Sample Company reports strong quarterly earnings', 'headline maps to title');
  assert.equal(first.url, 'https://example.com/article1');
  assert.equal(first.source, 'Reuters', 'source is passed through from the entry');
  assert.equal(
    first.publishedAtIso,
    new Date(FINNHUB_VALID_TIMESTAMP * 1000).toISOString(),
    'unix-SECONDS datetime converts to ISO by multiplying by 1000'
  );
  assert.equal(first.abstract, 'Sample Company beat analyst estimates on both revenue and EPS this quarter.');

  assert.equal(second.abstract, null, 'an empty-string summary must normalize to null, never an empty string');
}

function testFinnhubSourceFallback(): void {
  const withFallback = parseFinnhubNews(
    [
      {
        category: 'company news',
        datetime: FINNHUB_VALID_TIMESTAMP,
        headline: 'Entry without its own source field',
        id: 201,
        related: 'AAPL',
        summary: 'x',
        url: 'https://example.com/article-fallback',
      },
    ],
    'Finnhub (AAPL)'
  );
  assert.equal(withFallback.items.length, 1);
  assert.equal(
    withFallback.items[0].source,
    'Finnhub (AAPL)',
    'a caller-supplied fallbackSource is used when the entry has no source field'
  );

  const withoutFallback = parseFinnhubNews([
    {
      category: 'company news',
      datetime: FINNHUB_VALID_TIMESTAMP,
      headline: 'Entry without source field or fallback',
      id: 202,
      related: 'AAPL',
      summary: 'x',
      url: 'https://example.com/article-no-fallback',
    },
  ]);
  assert.equal(withoutFallback.items.length, 1);
  assert.equal(
    withoutFallback.items[0].source,
    'Finnhub',
    'with neither an entry source nor a fallbackSource, "Finnhub" is the honest default'
  );
}

// --- Malformed inputs: every parser must return an honest error, never throw ---
function testMalformedInputsNeverThrow(): void {
  const badGoogle = parseGoogleNewsRss('not xml at all');
  assert.deepEqual(badGoogle.items, [], 'garbage input yields zero items, not a crash');
  assert.equal(typeof badGoogle.error, 'string');
  assert.ok(badGoogle.error && badGoogle.error.length > 0, 'error must be a non-empty string');

  const badPublisher = parseRssFeed('<html><body>oops, not an rss feed</body></html>', 'ET Markets');
  assert.deepEqual(badPublisher.items, []);
  assert.ok(badPublisher.error && badPublisher.error.length > 0, 'error must be a non-empty string');

  const badFinnhubString = parseFinnhubNews('nope');
  assert.deepEqual(badFinnhubString.items, []);
  assert.ok(badFinnhubString.error && badFinnhubString.error.length > 0);

  const badFinnhubObject = parseFinnhubNews({});
  assert.deepEqual(badFinnhubObject.items, []);
  assert.ok(badFinnhubObject.error && badFinnhubObject.error.length > 0);

  // The live-probed Finnhub 401 body shape: {"error":"Invalid API key"}
  const finnhubApiError = parseFinnhubNews({ error: 'Invalid API key' });
  assert.deepEqual(finnhubApiError.items, []);
  assert.ok(
    finnhubApiError.error && finnhubApiError.error.includes('Invalid API key'),
    'the honest error must surface the Finnhub API message, not a generic string'
  );
}

function main(): void {
  testGoogleNewsRss();
  testPublisherRssFeed();
  testSingleItemChannelYieldsArray();
  testFinnhubNewsValid();
  testFinnhubSourceFallback();
  testMalformedInputsNeverThrow();

  console.log(
    'PASS: news-parse — all 6 case groups passed (Google News RSS, publisher RSS CDATA/+0530, single-item array pitfall, Finnhub valid+skip, Finnhub source fallback, malformed-input honesty)'
  );
  process.exit(0);
}

main();
