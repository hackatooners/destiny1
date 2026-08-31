import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';
import { StoryIdParams, StoryPageParams } from './story.params.js';

@ApiTags('story')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  @ApiOkResponse({ description: 'Greeting string', type: String })
  getHello(): string {
    // Takes no parameters, so the global ValidationPipe is never invoked for this route.
    return this.appService.getHello();
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
  @ApiOperation({ summary: 'Get the first page of a story' })
  @ApiOkResponse({ description: 'Raw markdown of the start page', type: String })
  getStoryStart(@Param() params: StoryIdParams): string {
    return this.appService.getStoryStart(params.storyId);
  }

  @Get('stories/:storyId/:pageId')
  @ApiOperation({ summary: 'Get a page from a story by its file name (without .md)' })
  @ApiOkResponse({ description: 'Raw markdown of the requested page', type: String })
  getStory(@Param() params: StoryPageParams): string {
    return this.appService.getStoryPage(params.storyId, params.pageId);
  }
}
