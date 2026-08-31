import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { STORY_SLUG_PATTERN, STORY_SLUG_RE } from './story.paths.js';

/**
 * DTOs for URL params — Nest’s usual way to validate incoming data.
 *
 * A DTO (“data transfer object”) is a class that *describes* a request shape.
 * It is not the markdown file. storyId / pageId here are the :storyId and
 * :pageId pieces of the route.
 *
 * How it runs: configureApp() registers ValidationPipe globally. When a
 * controller method does `@Param() params: StoryPageParams`, that pipe:
 * 1. Copies route params onto a StoryPageParams instance (transform: true).
 * 2. Runs class-validator decorators such as @Matches.
 * 3. Returns 400 if a field fails (e.g. "a-new-job.md" has a dot).
 *
 * @ApiProperty is only for Swagger (/api). It does not enforce anything.
 * The real check is @Matches, using the same slug regex as story.paths.ts.
 *
 * Disk safety (file exists, still under stories/) is NOT this file — see story.paths.ts.
 */

/** GET /stories/:storyId */
export class StoryIdParams {
  @ApiProperty({
    example: 'mari',
    description: 'Name of the story folder under stories/',
    pattern: STORY_SLUG_PATTERN,
  })
  @Matches(STORY_SLUG_RE)
  storyId: string;
}

/** GET /stories/:storyId/:pageId — inherits storyId, adds pageId. */
export class StoryPageParams extends StoryIdParams {
  @ApiProperty({
    example: 'end1',
    description: 'Name of the markdown file in the story folder, without extension',
    pattern: STORY_SLUG_PATTERN,
  })
  @Matches(STORY_SLUG_RE)
  pageId: string;
}
