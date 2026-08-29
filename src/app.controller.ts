import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';

@ApiTags('story')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  @ApiOkResponse({ description: 'Greeting string', type: String })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('start')
  @ApiOperation({ summary: 'Get the first page of the story' })
  @ApiOkResponse({ description: 'Raw markdown of the start page', type: String })
  getStart(): string {
    return this.appService.getStart();
  }

  @Get('page/:fileName')
  @ApiOperation({ summary: 'Get a story page by its file name (without .md)' })
  @ApiParam({ name: 'fileName', example: 'end1', description: 'Name of the markdown file in story/, without extension' })
  @ApiOkResponse({ description: 'Raw markdown of the requested page', type: String })
  getPage(@Param('fileName') fileName: string): string {
    return this.appService.getPage(fileName);
  }

  @Get('stories/:storyId')
  @ApiOperation({ summary: 'Get the first page of a story' })
  @ApiParam({ name: 'storyId', example: 'mari', description: 'Name of the story folder under stories/' })
  @ApiOkResponse({ description: 'Raw markdown of the start page', type: String })
  getStoryStart(@Param('storyId') storyId: string): string {
    return this.appService.getStoryStart(storyId);
  }

  @Get('stories/:storyId/:pageId')
  @ApiOperation({ summary: 'Get a page from a story by its file name (without .md)' })
  @ApiParam({ name: 'storyId', example: 'mari', description: 'Name of the story folder under stories/' })
  @ApiParam({ name: 'pageId', example: 'end1', description: 'Name of the markdown file in the story folder, without extension' })
  @ApiOkResponse({ description: 'Raw markdown of the requested page', type: String })
  getStory(@Param('storyId') storyId: string, @Param('pageId') pageId: string): string {
    return this.appService.getStoryPage(storyId, pageId);
  }
}
