import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

// @Injectable() lets Nest manage this class and inject it into controllers,
// so you never call `new AppService()` yourself.
@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  // Entry point: resolve the story's start page, then load it like any other page.
  getStoryStart(storyId: string): string {
    const startPage = this.getStoryStartPage(storyId);
    return this.getStoryPage(storyId, startPage);
  }

  // Reads meta.json to find the start page id for a story (e.g. richard -> 'a-new-job').
  private getStoryStartPage(storyId: string): string {
    const metaPath = join(import.meta.dirname, '..', 'stories', storyId, 'meta.json');
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      return meta.start ?? 'start';
    } catch (err) {
      // No/invalid meta.json - fall back to the 'start' filename convention.
      return 'start';
    }
  }

  // Reads one story page's markdown file from disk by story + page id.
  getStoryPage(storyId: string, pageId: string): string {
    const filePath = join(import.meta.dirname, '..', 'stories', storyId, `${pageId}.md`);
    try {
      const data = readFileSync(filePath, 'utf8');
      return data;
    } catch (err) {
      console.error(err);
      return `Error reading file: ${storyId}/${pageId}.md`;
    }
  }
}
