import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOperation, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';
import { StoryIdParams, StoryPageParams } from './story.params.js';

/**
 * Story bodies are markdown, so they must be labeled as such.
 *
 * Without @Header, Express labels any string return "text/html" — res.send() only picks a
 * default when Content-Type is unset, and the decorator sets it first. That mislabel is
 * what makes browsers mangle pages today: they parse the markdown AS HTML, collapse the
 * line breaks, and print "[buceo profesional](end1.md)" literally.
 *
 * What this changes: Chrome/Edge display the source verbatim as plain text, like a .txt
 * (Firefox may offer a download instead). What it does NOT change: no browser renders
 * text/markdown as a formatted document (still true in 2026) — links stay unclickable
 * either way. This is truth in labeling, not rendering; the rendered reader lives in
 * read.controller.ts and the options analysis in ai-chats/browser-presentation-options.md.
 */
const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';

@ApiTags('story')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  @ApiOkResponse({ description: 'Simple liveness message', type: String })
  getHealth(): string {
    // Takes no parameters, so the global ValidationPipe is never invoked for this route.
    return this.appService.getHealth();
  }

  /**
   * Note the parameter style below: `@Param() params: StoryIdParams` (no argument to
   * @Param) instead of `@Param('storyId') storyId: string`.
   *
   * That is what activates the DTO. Nest reads the parameter's TYPE via decorator
   * metadata, hands the whole route-params object to the global ValidationPipe, and the
   * pipe instantiates StoryIdParams and runs its @Matches rules — producing a 400 for a
   * malformed slug. With `@Param('storyId') storyId: string` the metadata type is just
   * String, which ValidationPipe skips entirely.
   *
   * There are no @ApiParam decorators here any more: the DTO's @ApiProperty already
   * describes these params for Swagger, and keeping both produced duplicated, conflicting
   * entries in the generated doc at /api.
   *
   * IMPORTANT: this validation is defense-in-depth and better error codes — it is NOT
   * what makes the app safe. The security boundary is resolveStoryPageFile() in
   * story.paths.ts, which AppService calls regardless of how it was invoked. Delete this
   * DTO layer and the app is still safe; delete story.paths.ts and it is not.
   */
  @Get('stories/:storyId')
  @Header('Content-Type', MARKDOWN_CONTENT_TYPE)
  @ApiProduces(MARKDOWN_CONTENT_TYPE)
  @ApiOperation({ summary: 'Get the first page of a story' })
  @ApiOkResponse({
    description: `Raw markdown of the start page (Content-Type: ${MARKDOWN_CONTENT_TYPE})`,
    type: String,
  })
  getStoryStart(@Param() params: StoryIdParams): string {
    return this.appService.getStoryStart(params.storyId);
  }

  @Get('stories/:storyId/:pageId')
  @Header('Content-Type', MARKDOWN_CONTENT_TYPE)
  @ApiProduces(MARKDOWN_CONTENT_TYPE)
  @ApiOperation({ summary: 'Get a page from a story by its file name (without .md)' })
  @ApiOkResponse({
    description: `Raw markdown of the requested page (Content-Type: ${MARKDOWN_CONTENT_TYPE})`,
    type: String,
  })
  getStory(@Param() params: StoryPageParams): string {
    return this.appService.getStoryPage(params.storyId, params.pageId);
  }
}
