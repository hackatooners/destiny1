import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { NotFoundException } from '@nestjs/common';

/**
 * Turns storyId / pageId into a real file under stories/, or 404.
 *
 * Two independent checks (both needed):
 * 1. Slug shape — the string must look like a folder/file name (no "..", slashes, dots).
 *    HTTP also validates this via ValidationPipe + DTOs; we repeat it here because
 *    AppService can be called from tests or other code that skips HTTP.
 * 2. Disk — compose a path, then prove that path is an existing *file* still inside
 *    the stories directory (even if a symlink tries to point outside).
 *
 * path.resolve only *builds* a string; it does not ask the OS if the file exists
 * or whether it escaped the folder. realpathSync does the OS lookup.
 */

/** Kebab-case only: lowercase letters, digits, hyphens. Used by DTOs and by this module. */
export const STORY_SLUG_PATTERN = '^[a-z0-9][a-z0-9-]{0,63}$';
export const STORY_SLUG_RE = new RegExp(STORY_SLUG_PATTERN);

// Directory that holds one folder per story. Default: repo-root/stories
// (this file lives in src/, so ".." is the repo root — same hop from dist/ after build).
export const STORIES_ROOT = process.env.STORIES_ROOT
  ? resolve(process.env.STORIES_ROOT)
  : join(import.meta.dirname, '..', 'stories');

export function isStorySlug(value: string): boolean {
  return typeof value === 'string' && STORY_SLUG_RE.test(value);
}

/** True if `target` is a path strictly inside `root` (not root itself, not a parent). */
function isInsideRoot(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel);
}

/**
 * candidate is already an absolute path we *intend* to read.
 * Reject it unless it exists, is a file, and after following symlinks still sits under stories/.
 */
function assertResolvedFileInsideStories(candidate: string): string {
  // Cheap string check before hitting the disk (resolve() can walk ".." out of stories/).
  if (!candidate.startsWith(STORIES_ROOT + sep)) {
    throw new NotFoundException();
  }

  let real: string;
  try {
    // Follows symlinks; throws if the path is missing.
    real = realpathSync(candidate);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new NotFoundException();
    }
    throw err;
  }

  let root: string;
  try {
    // Canonicalize the stories folder too, so we compare apples to apples after symlinks.
    root = realpathSync(STORIES_ROOT);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new NotFoundException();
    }
    throw err;
  }

  if (!isInsideRoot(root, real) || !statSync(real).isFile()) {
    throw new NotFoundException();
  }

  return real;
}

/** Absolute path of stories/<storyId>/<pageId>.md, or 404. */
export function resolveStoryPageFile(storyId: string, pageId: string): string {
  if (!isStorySlug(storyId) || !isStorySlug(pageId)) {
    throw new NotFoundException();
  }
  return assertResolvedFileInsideStories(
    resolve(STORIES_ROOT, storyId, `${pageId}.md`),
  );
}

/** Absolute path of stories/<storyId>/meta.json, or 404. */
export function resolveStoryMetaFile(storyId: string): string {
  if (!isStorySlug(storyId)) {
    throw new NotFoundException();
  }
  return assertResolvedFileInsideStories(
    resolve(STORIES_ROOT, storyId, 'meta.json'),
  );
}
