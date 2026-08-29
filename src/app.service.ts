import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getStoryStart(storyId: string): string {
    // TODO:
    // use a dictionary or metadata or something to get the start page for each story
    // eg: richard start with 'a-new-job'
    return this.getStoryPage(storyId, 'start');

  }

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
