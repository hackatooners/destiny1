import { Marked, type Tokens } from 'marked';
import { STORY_SLUG_PATTERN } from './story.paths.js';

/**
 * Pure presentation layer: markdown in, HTML strings out. No disk access, no Nest
 * types — which keeps it unit-testable without fixtures, the same contract as
 * pickStartPage() in app.service.ts.
 *
 * SECURITY / TRUST DECISION: there is deliberately NO sanitizer here. Story content
 * is author-controlled (repo committers), the same trust level as the raw
 * /stories/... responses today. marked escapes text-node HTML, so an author who
 * writes <script> in a page gets it displayed, not executed. If stories ever become
 * user-submitted, add a sanitizer (sanitize-html / DOMPurify) in the same commit
 * that change lands in.
 *
 * Note the dedicated `new Marked(...)` instance. marked.use() mutates a shared
 * global singleton, so configuring it there would leak options between test files;
 * an instance keeps this module's configuration contained.
 */
const md = new Marked({
  // Soft line breaks inside a paragraph render as <br>. This is a safety net for
  // authors who put choice links on adjacent lines without list syntax — without
  // it, CommonMark joins them into one run-on paragraph line.
  breaks: true,
  renderer: {
    /**
     * Rewrite same-directory page links to reader URLs.
     *
     * The raw href (e.g. "end1.md") arrives here before any HTML is emitted, so
     * there is no output to re-parse and no risk of rewriting text that merely
     * looks like an anchor. (marked does not escape `"` in text nodes, so a
     * paragraph containing the literal `href="end1.md"` would be a false positive
     * for a regex over generated HTML — the reason this lives in the hook.)
     *
     * Only bare kebab-case .md hrefs are rewritten, reusing the slug rule from
     * story.paths.ts so a link can never point outside its own story. Everything
     * else (http(s)://, ../x.md, #anchors, uppercase or spaced names) renders as
     * the author wrote it.
     */
    link(token: Tokens.Link) {
      const slug = STORY_HREF_RE.exec(token.href)?.[1];
      if (slug === undefined) {
        return false; // not a page link: fall through to marked's default renderer
      }
      // token.href is clean here by the regex above, and parseInline() runs the
      // normal text escapes for the label.
      return `<a href="/read/${currentStoryId}/${slug}">${this.parser.parseInline(token.tokens)}</a>`;
    },
  },
});

/**
 * A bare same-directory page reference: "end1.md" -> capture "end1".
 *
 * Derived from STORY_SLUG_PATTERN (single source of truth for what a page id is)
 * so a future slug-rule change keeps link rewriting and routing in agreement.
 * The pattern ships with its own ^...$ anchors, which are stripped before it is
 * embedded here; this regex supplies the anchors and the .md suffix.
 */
const STORY_HREF_RE = new RegExp(
  `^(${STORY_SLUG_PATTERN.replaceAll('^', '').replaceAll('$', '')})\\.md$`,
);

/**
 * The story id is needed by the link hook above, but marked's renderer API has no
 * per-call context — the hook's `this` is marked's Renderer, not our instance. So
 * the id rides in this module variable for the duration of one parse. renderPage()
 * sets it immediately before parsing and clears it in a finally, so a throw in
 * between cannot leak it into a later parse of another story. Parsing is
 * synchronous, so no interleaving is possible.
 */
let currentStoryId: string | undefined;

/** Minimal HTML-escape for the few places author text reaches outside marked. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Page <title> and heading fallback chain: the document's first level-1 heading,
 * else the story's title from meta.json.
 *
 * The heading is found in the token stream, not by regex over the markdown, so a
 * "# heading" inside a fenced code block cannot spoof it. mari/start.md has no
 * heading, which is why the fallback exists.
 */
export function pickPageTitle(markdown: string, storyTitle: string): string {
  for (const token of md.lexer(markdown)) {
    if (token.type === 'heading' && token.depth === 1) {
      return token.text;
    }
  }
  return storyTitle;
}

/** Page chrome shared by every reader page: one layout, one inline stylesheet. */
function renderLayout({ title, body }: { title: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light dark; }
body { margin: 0; font: 100%/1.7 system-ui, sans-serif; }
main { max-width: 38rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
nav.top { padding: .5rem 1.25rem; border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent); }
nav.top a { text-decoration: none; }
main nav.choices { list-style: none; padding: 0; }
main nav.choices li { margin: .35rem 0; }
@media (min-width: 40rem) {
  main nav.choices { display: grid; gap: .6rem; }
}
h1 { line-height: 1.25; }
a { color: inherit; }
</style>
</head>
<body>
<nav class="top"><a href="/">← Stories</a></nav>
<main>
${body}
</main>
</body>
</html>
`;
}

/**
 * Render one story page for the browser.
 *
 * The choices list gets a hook so future styling (P2-era polish) has a handle
 * without re-parsing; today it is a plain markdown list rendered as authored.
 */
export function renderPage({ storyId, storyTitle, markdown }: {
  storyId: string;
  storyTitle: string;
  markdown: string;
}): string {
  currentStoryId = storyId;
  let fragment: string;
  try {
    fragment = md.parse(markdown, { async: false });
  } finally {
    currentStoryId = undefined;
  }
  return renderLayout({
    title: `${pickPageTitle(markdown, storyTitle)} — destiny1`,
    body: fragment,
  });
}

/** The story index at GET / — one link per story, alphabetical by id. */
export function renderIndex(stories: Array<{ id: string; title: string }>): string {
  const items = stories
    .map((s) => `  <li><a href="/read/${s.id}">${escapeHtml(s.title)}</a></li>`)
    .join('\n');
  return renderLayout({
    title: 'destiny1 — stories',
    body: `<h1>Stories</h1>
<ul>
${items}
</ul>`,
  });
}

/** HTML body for the /read 404 page (see read-not-found.filter.ts). */
export function renderNotFound(): string {
  return renderLayout({
    title: 'Page not found — destiny1',
    body: `<h1>Page not found</h1>
<p>That story or page does not exist.</p>
<p><a href="/">Back to the story list</a></p>`,
  });
}
