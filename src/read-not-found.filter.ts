import { ArgumentsHost, Catch, ExceptionFilter, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { renderNotFound } from './story.render.js';

/**
 * HTML 404 page for the reader routes.
 *
 * Scoped with @UseFilters() to ReadController only — that scoping IS the design.
 * The raw /stories/... API keeps Nest's JSON error shape for curl/Swagger
 * consumers, while a human who follows a dead link in a browser gets a page
 * with a way back. Serving both from one URL by sniffing Accept headers is a
 * different proposal (P5 in ai-chats/browser-presentation-options.md) and
 * deliberately not done here.
 */
@Catch(NotFoundException)
export class ReadNotFoundExceptionFilter implements ExceptionFilter {
  catch(_exception: NotFoundException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(404).type('text/html').send(renderNotFound());
  }
}
