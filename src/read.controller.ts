import { Controller, Get, Header, Param, UseFilters } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';
import { ReadNotFoundExceptionFilter } from './read-not-found.filter.js';
import { StoryIdParams, StoryPageParams } from './story.params.js';
import { renderIndex, renderPage } from './story.render.js';

/**
 * The human-facing reader: HTML pages for the browser.
 *
 * Mirrors AppController's two story routes under /read plus a story index at /,
 * with the same DTO slug validation (400 on malformed ids) and the same
 * AppService reads — so the security boundary in story.paths.ts applies here
 * unchanged. What differs is presentation: rendered HTML instead of raw
 * markdown, and an HTML 404 page instead of Nest's JSON error (see
 * read-not-found.filter.ts, scoped to this controller only).
 *
 * These routes ARE in Swagger (under the "read" tag), so testers can click them
 * from the /api UI. Their 404s respond text/html via the filter above, which the
 * ApiResponses annotations below can only hint at — Swagger documents one
 * representation, the server serves two audiences.
 */
const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';

@UseFilters(ReadNotFoundExceptionFilter)
@ApiTags('read')
@Controller()
export class ReadController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Header('Content-Type', HTML_CONTENT_TYPE)
  @ApiProduces(HTML_CONTENT_TYPE)
  @ApiOperation({ summary: 'Story index (HTML)' })
  @ApiOkResponse({
    description: `Index page linking every story (Content-Type: ${HTML_CONTENT_TYPE})`,
    type: String,
  })
  getIndex(): string {
    return renderIndex(this.appService.listStories());
  }

  @Get('read/:storyId')
  @Header('Content-Type', HTML_CONTENT_TYPE)
  @ApiProduces(HTML_CONTENT_TYPE)
  @ApiOperation({ summary: 'Read the first page of a story (HTML)' })
  @ApiOkResponse({
    description: `Rendered start page with rewritten links (Content-Type: ${HTML_CONTENT_TYPE})`,
    type: String,
  })
  getStoryStart(@Param() params: StoryIdParams): string {
    return this.render(params.storyId, this.appService.getStoryStart(params.storyId));
  }

  @Get('read/:storyId/:pageId')
  @Header('Content-Type', HTML_CONTENT_TYPE)
  @ApiProduces(HTML_CONTENT_TYPE)
  @ApiOperation({ summary: 'Read one page of a story (HTML)' })
  @ApiOkResponse({
    description: `Rendered page with rewritten links (Content-Type: ${HTML_CONTENT_TYPE})`,
    type: String,
  })
  getStoryPage(@Param() params: StoryPageParams): string {
    return this.render(
      params.storyId,
      this.appService.getStoryPage(params.storyId, params.pageId),
    );
  }

  // Both page routes share this: the page title comes from meta.json, which
  // getStoryTitle resolves with a slug fallback.
  private render(storyId: string, markdown: string): string {
    return renderPage({
      storyId,
      storyTitle: this.appService.getStoryTitle(storyId),
      markdown,
    });
  }
}
