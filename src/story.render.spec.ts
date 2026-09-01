/**
 * Unit tests for the pure render layer — no Nest, no disk, no HTTP.
 *
 * Run with `pnpm test` (vitest.config.ts includes **\/*.spec.ts).
 *
 * These exist because the e2e suite can only prove what the two real stories
 * happen to contain. The rules below are about authoring edge cases — links that
 * must NOT be rewritten, code blocks that must not win the title, soft breaks
 * between choices — which is exactly what this file pins down.
 */
import { describe, expect, it } from 'vitest';
import { pickPageTitle, renderIndex, renderNotFound, renderPage } from './story.render.js';

describe('renderPage: same-directory .md links become /read/<story>/<page>', () => {
  it('rewrites a bare slug .md href', () => {
    const html = renderPage({
      storyId: 'mari',
      storyTitle: "Mari's life",
      markdown: '- [buceo profesional](end1.md)',
    });
    expect(html).toContain('<a href="/read/mari/end1">buceo profesional</a>');
  });

  it('uses the story being rendered, not a stale one from a previous call', () => {
    renderPage({ storyId: 'mari', storyTitle: 'm', markdown: '[x](end1.md)' });
    const html = renderPage({
      storyId: 'richard',
      storyTitle: 'r',
      markdown: '[x](rosie.md)',
    });
    expect(html).toContain('<a href="/read/richard/rosie">x</a>');
    expect(html).not.toContain('/read/mari/');
  });

  it('leaves absolute http(s) links untouched', () => {
    const html = renderPage({
      storyId: 'mari',
      storyTitle: 'm',
      markdown: '[site](https://example.com/a.md) and [other](http://example.com/b.md)',
    });
    expect(html).toContain('<a href="https://example.com/a.md">site</a>');
    expect(html).toContain('<a href="http://example.com/b.md">other</a>');
  });

  it('leaves parent-directory .md links untouched', () => {
    const html = renderPage({
      storyId: 'mari',
      storyTitle: 'm',
      markdown: '[x](../secret.md)',
    });
    expect(html).toContain('<a href="../secret.md">x</a>');
    expect(html).not.toContain('/read/');
  });

  it('leaves non-slug hrefs untouched (uppercase, spaces, leading hyphen)', () => {
    // Angle brackets are the CommonMark way to write a destination with spaces;
    // a bare [a](My Page.md) is not a link at all and renders as literal text.
    const html = renderPage({
      storyId: 'mari',
      storyTitle: 'm',
      markdown: '[a](<My Page.md>) [b](UPPER.md) [c](-bad.md)',
    });
    expect(html).toContain('<a href="My%20Page.md">a</a>');
    expect(html).toContain('<a href="UPPER.md">b</a>');
    expect(html).toContain('<a href="-bad.md">c</a>');
  });

  it('does not rewrite text that merely looks like an anchor', () => {
    // The regression test for the regex-over-output approach this design rejects:
    // marked does not escape `"` in text nodes, so scanning generated HTML with a
    // href pattern would falsely rewrite this paragraph.
    const html = renderPage({
      storyId: 'mari',
      storyTitle: 'm',
      markdown: 'Type `href="end1.md"` to see the source.',
    });
    expect(html).toContain('href=&quot;end1.md&quot;');
    expect(html).not.toContain('<a href="/read/');
  });
});

describe('renderPage: breaks', () => {
  it('renders adjacent-line links with a <br> between them (breaks: true)', () => {
    const html = renderPage({
      storyId: 'mari',
      storyTitle: 'm',
      markdown: '[one](end1.md)\n[two](end2.md)',
    });
    // Either order proves a hard break rather than a joined soft break.
    expect(html).toMatch(
      /end1"?>[^<]*<\/a><br ?\/?>?<a href="\/read\/mari\/end2"|end2"?>[^<]*<\/a><br ?\/?>?<a href="\/read\/mari\/end1"/,
    );
  });
});

describe('pickPageTitle', () => {
  it('uses the first level-1 heading', () => {
    expect(pickPageTitle('# A New Job\n\nbody', 'fallback')).toBe('A New Job');
  });

  it('skips deeper headings', () => {
    expect(pickPageTitle('## sub\n\nbody', 'fallback')).toBe('fallback');
  });

  it('falls back to the story title when there is no heading', () => {
    // mari/start.md is exactly this shape.
    expect(pickPageTitle('Mari nacio,\ntenia que elegir', "Mari's life")).toBe("Mari's life");
  });

  it('is not spoofed by a heading inside a fenced code block', () => {
    expect(pickPageTitle('```\n# fake\n```\n\nreal body', 'fallback')).toBe('fallback');
  });

  it('takes the FIRST h1 when there are several', () => {
    expect(pickPageTitle('# First\n\n# Second', 'fallback')).toBe('First');
  });
});

describe('layout', () => {
  it('wraps page output with doctype, charset, title, and a link home', () => {
    const html = renderPage({ storyId: 'mari', storyTitle: 'm', markdown: 'body text' });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<title>');
    expect(html).toContain('href="/"');
  });

  it('HTML-escapes the <title> (author content outside marked)', () => {
    const html = renderPage({
      storyId: 'mari',
      storyTitle: 'm',
      markdown: '# Evil & <script>alert(1)</script>',
    });
    expect(html).toMatch(/<title>Evil &amp; &lt;script&gt;/);
    expect(html).not.toMatch(/<title>.*<script>/);
  });
});

describe('renderIndex', () => {
  it('lists one link per story', () => {
    const html = renderIndex([
      { id: 'mari', title: "Mari's life" },
      { id: 'richard', title: 'The interview' },
    ]);
    expect(html).toContain('<a href="/read/mari">Mari&#39;s life</a>');
    expect(html).toContain('<a href="/read/richard">The interview</a>');
  });

  it('escapes titles', () => {
    const html = renderIndex([{ id: 'x', title: '<b>' }]);
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<b>');
  });
});

describe('renderNotFound', () => {
  it('is a full document with a way back', () => {
    const html = renderNotFound();
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('not found');
    expect(html).toContain('href="/"');
  });
});
