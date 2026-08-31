/**
 * Unit tests for story.paths.ts — not loaded by the Nest app.
 *
 * This repo uses Vitest (`pnpm test`), not Jest. The `describe` / `it` / `expect`
 * API looks like Jest because Vitest copied it; Nest 12's default CLI template
 * wired Vitest here (see vitest.config.ts: include all files named *.spec.ts).
 *
 * File layout:
 * - `src/*.spec.ts` — unit tests, sit next to the module they cover (this file).
 * - `test/*.e2e-spec.ts` — HTTP tests through the real app (`pnpm test:e2e`).
 *
 * Cases below use made-up ids only. They must not depend on files under stories/.
 */
import { NotFoundException } from '@nestjs/common';
import { isStorySlug, resolveStoryPageFile } from './story.paths.js';

describe('story path hardening', () => {
  it('accepts kebab-case story and page ids', () => {
    expect(isStorySlug('story-one')).toBe(true);
    expect(isStorySlug('page-two')).toBe(true);
    expect(isStorySlug('end1')).toBe(true);
  });

  it('rejects path metacharacters and other non-slug values', () => {
    expect(isStorySlug('')).toBe(false);
    expect(isStorySlug('StoryOne')).toBe(false);
    expect(isStorySlug('a_new_job')).toBe(false);
    expect(isStorySlug('a.new.job')).toBe(false);
    expect(isStorySlug('..')).toBe(false);
    expect(isStorySlug('../stories')).toBe(false);
    expect(isStorySlug('foo/bar')).toBe(false);
    expect(isStorySlug('foo\\bar')).toBe(false);
    expect(isStorySlug('foo bar')).toBe(false);
    expect(isStorySlug('*.md')).toBe(false);
    expect(isStorySlug('a'.repeat(65))).toBe(false);
  });

  it('does not resolve missing or invalid pages', () => {
    expect(() => resolveStoryPageFile('no-such-story', 'no-such-page')).toThrow(
      NotFoundException,
    );
    expect(() => resolveStoryPageFile('..', 'page-two')).toThrow(NotFoundException);
    expect(() => resolveStoryPageFile('story-one', '../meta')).toThrow(
      NotFoundException,
    );
  });
});
