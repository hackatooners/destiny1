import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Marked, type Tokens } from 'marked';
import { STORY_SLUG_PATTERN } from './story.paths.js';

/**
 * Markdown in, HTML strings out. No disk access, no Nest types.
 *
 * SECURITY: no sanitizer here, deliberately. Story content is author-controlled
 * (repo committers), the same trust level as the raw /stories/... responses.
 * marked escapes text-node HTML, so an author writing <script> gets it displayed,
 * not executed. If stories ever become user-submitted, add a sanitizer
 * (sanitize-html / DOMPurify) in the same commit.
 *
 * Uses `new Marked(...)` rather than marked.use(), which mutates a shared global
 * and would leak these options between test files.
 */
const md = new Marked({
  // Soft line breaks render as <br>, so choice links on adjacent lines without
  // list syntax don't collapse into one run-on line.
  breaks: true,
  renderer: {
    /**
     * Rewrite same-directory page links ("end1.md") to reader URLs.
     *
     * Lives in the renderer hook rather than a regex over the output because the
     * href arrives here structurally: a paragraph containing the literal text
     * `href="end1.md"` can't be mistaken for a link.
     *
     * Only bare kebab-case .md hrefs match, reusing the slug rule from
     * story.paths.ts so a link cannot point outside its own story. http(s)://,
     * ../x.md, #anchors and uppercase or spaced names render as authored.
     */
    link(token: Tokens.Link) {
      const slug = STORY_HREF_RE.exec(token.href)?.[1];
      if (slug === undefined) {
        return false; // marked's contract: fall through to the default renderer
      }
      // slug is constrained by STORY_HREF_RE; parseInline escapes the label.
      return `<a href="/read/${currentStoryId}/${slug}">${this.parser.parseInline(token.tokens)}</a>`;
    },
  },
});

/**
 * A bare same-directory page reference: "end1.md" -> captures "end1".
 *
 * Built from STORY_SLUG_PATTERN so link rewriting and routing agree on what a
 * page id is. That pattern carries its own ^...$ anchors; they are stripped so
 * this regex can supply its own plus the .md suffix.
 */
const STORY_HREF_RE = new RegExp(
  `^(${STORY_SLUG_PATTERN.replaceAll('^', '').replaceAll('$', '')})\\.md$`,
);

/**
 * Story id for the link hook above, which has no per-call context of its own
 * (`this` there is marked's Renderer). renderPage() sets it before parsing and
 * clears it in a finally, so a throw cannot leak it into the next story. Parsing
 * is synchronous, so two parses never interleave.
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
 * The page's first level-1 heading, else the story title from meta.json (some
 * pages, e.g. mari/start.md, have no heading).
 *
 * Read from the token stream rather than by regex, so a "# heading" inside a
 * fenced code block cannot spoof it.
 */
export function pickPageTitle(markdown: string, storyTitle: string): string {
  for (const token of md.lexer(markdown)) {
    if (token.type === 'heading' && token.depth === 1) {
      return token.text;
    }
  }
  return storyTitle;
}

/**
 * Templates are read once at module load; every request is string interpolation.
 *
 * The path is relative to this file, resolving under src/ in vitest and dist/ in
 * production — nest-cli.json copies views/ with the same layout.
 */
const viewsDir = fileURLToPath(new URL('./views/', import.meta.url));
const layoutTemplate = readFileSync(`${viewsDir}layout.html`, 'utf8');
const indexTemplate = readFileSync(`${viewsDir}index.html`, 'utf8');
const notFoundTemplate = readFileSync(`${viewsDir}not-found.html`, 'utf8');

/**
 * Shift every line of a fragment right to `indent`.
 *
 * Blank lines stay bare, so no line is pure whitespace. The trailing newline is
 * dropped because the template line being replaced already ends in one; keeping
 * both leaves a blank line before the closing tag.
 */
function indentBlock(value: string, indent: string): string {
  return value
    .replace(/\n+$/, '')
    .split('\n')
    .map((line) => (line === '' ? line : indent + line))
    .join('\n');
}

/**
 * Fill {{mustache}} placeholders, preserving the template's indentation.
 *
 * Two passes per key, because a placeholder appears in two shapes and only one
 * of them can carry indentation:
 *
 *   <title>{{title}}</title>   inline — spliced into a line
 *         {{body}}             block  — is the line
 *
 * Block runs first; whatever it leaves is inline. Callers pass bare fragments
 * and the template decides where they sit.
 *
 * SECURITY: values are never re-scanned, and callers escape author text before
 * it reaches here, so injected content cannot introduce new placeholders. Keys
 * are our own literals, so building a RegExp from one is safe.
 */
function fill(template: string, values: Record<string, string>): string {
  let html = template;
  for (const [key, value] of Object.entries(values)) {
    // Under /m, ^ and $ are line boundaries, so this matches only when nothing
    // shares the line; the capture group is the indentation to reproduce.
    const blockPlaceholder = new RegExp(`^([ \\t]*)\\{\\{${key}\\}\\}$`, 'gm');
    html = html.replaceAll(blockPlaceholder, (_match, indent: string) =>
      indentBlock(value, indent),
    );

    // Both replacers are functions: a string replacement would read `$&` or `$1`
    // in the value as a substitution pattern and mangle it.
    html = html.replaceAll(`{{${key}}}`, () => value);
  }
  return html;
}

/** Page chrome shared by every reader page. */
function renderLayout({ title, body }: { title: string; body: string }): string {
  return fill(layoutTemplate, { title: escapeHtml(title), body });
}

/** Render one story page for the browser. */
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

/** The story index at GET / — one link per story, in the order given. */
export function renderIndex(stories: Array<{ id: string; title: string }>): string {
  const items = stories
    .map((s) => `<li><a href="/read/${s.id}">${escapeHtml(s.title)}</a></li>`)
    .join('\n');
  return renderLayout({
    title: 'destiny1 — stories',
    body: fill(indexTemplate, { items }),
  });
}

/** HTML body for the /read 404 page (see read-not-found.filter.ts). */
export function renderNotFound(): string {
  return renderLayout({
    title: 'Page not found — destiny1',
    body: notFoundTemplate,
  });
}
