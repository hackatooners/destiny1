import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import {
  isStorySlug,
  resolveStoryMetaFile,
  resolveStoryPageFile,
} from './story.paths.js';

/**
 * Filename convention used when a story has no usable meta.json:
 * stories/<storyId>/start.md
 */
export const DEFAULT_START_PAGE = 'start';

/**
 * Decide which page id a story starts on, given the raw text of its meta.json.
 *
 * Pure on purpose: no disk access, no throwing. `null` means "there is no meta.json".
 * Being pure makes every degenerate meta.json (malformed JSON, missing key, wrong type)
 * testable without creating fixture files on disk — which matters here because
 * STORIES_ROOT is captured once at module load, so tests cannot easily point the app at
 * a temp directory. See src/app.service.spec.ts.
 *
 * NOTE ON TRUST: meta.json is author-controlled content, not request-controlled, so a
 * broken one degrades to the start.md convention rather than failing the request. The
 * isStorySlug() check below is NOT the security boundary — resolveStoryPageFile()
 * validates its own inputs regardless. It is here for two ordinary reasons:
 *   1. JSON.parse() returns `any`, so without it `{"start": 42}` would flow through
 *      typed as a string and blow up somewhere less obvious.
 *   2. It makes the fallback meaningful: a typo'd start page degrades to start.md
 *      instead of producing a confusing 404.
 */
export function pickStartPage(rawMeta: string | null): string {
  if (rawMeta === null) return DEFAULT_START_PAGE;

  try {
    const parsed = JSON.parse(rawMeta) as { start?: unknown } | null;
    const start = parsed?.start;
    return typeof start === 'string' && isStorySlug(start)
      ? start
      : DEFAULT_START_PAGE;
  } catch {
    // Malformed JSON is an authoring bug, not a request failure. Fall back.
    return DEFAULT_START_PAGE;
  }
}

// @Injectable() lets Nest manage this class and inject it into controllers,
// so you never call `new AppService()` yourself.
@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  getHello(): string {
    return 'Hello World!';
  }

  // Entry point: resolve the story's start page, then load it like any other page.
  getStoryStart(storyId: string): string {
    // Checked up front so the catch in getStoryStartPage() unambiguously means
    // "this story has no meta.json" rather than "you passed garbage". Without this,
    // an illegal storyId would take the fallback branch and only get rejected a line
    // later — harmless, but it muddies what that catch is for.
    if (!isStorySlug(storyId)) throw new NotFoundException();

    return this.getStoryPage(storyId, this.getStoryStartPage(storyId));
  }

  // Reads meta.json to find the start page id (e.g. richard -> 'a-new-job').
  private getStoryStartPage(storyId: string): string {
    let raw: string;
    try {
      raw = readFileSync(resolveStoryMetaFile(storyId), 'utf8');
    } catch (err) {
      // meta.json is optional. A missing one (or a missing story directory) means
      // "use the convention" — the subsequent resolveStoryPageFile() call will 404
      // anyway if start.md does not exist, so there is nothing to gain by failing here.
      if (err instanceof NotFoundException) return DEFAULT_START_PAGE;

      // Deliberately NOT a bare `catch {}`: EACCES/EIO are real server faults and
      // should surface as a 500, not be disguised as "story not found".
      throw err;
    }

    const startPage = pickStartPage(raw);
    if (startPage === DEFAULT_START_PAGE && !raw.includes(`"${DEFAULT_START_PAGE}"`)) {
      // A meta.json that exists but has no usable "start" is almost certainly a typo
      // (e.g. {"strat": "..."}). Warn the author; do not fail the reader's request.
      this.logger.warn(`stories/${storyId}/meta.json has no usable "start" key`);
    }
    return startPage;
  }

  /**
   * Reads one story page's markdown file from disk by story + page id.
   *
   * resolveStoryPageFile() is THE security boundary. It does three things that the old
   * raw join() did not: rejects anything that is not a kebab-case slug, resolves the
   * real path through symlinks, and proves the result is still a regular file inside
   * stories/. It throws NotFoundException when any of those fail.
   *
   * Note there is no try/catch here any more. The old code caught read errors and
   * RETURNED the string "Error reading file: ...", which Nest happily serialized as
   * HTTP 200 — that is what let traversal look like a successful response. Errors must
   * propagate so Nest's exception filter can turn them into a real 404.
   */
  getStoryPage(storyId: string, pageId: string): string {
    return readFileSync(resolveStoryPageFile(storyId, pageId), 'utf8');
  }
}
