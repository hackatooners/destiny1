import { INestApplication, ValidationPipe } from '@nestjs/common';

/**
 * Nest setup that must run for both `node dist/main` and e2e tests.
 *
 * createNestApplication() / NestFactory.create() do not read main.ts, so e2e
 * would skip ValidationPipe unless we call this here too. Put shared app
 * config in one function rather than copying it.
 *
 * ValidationPipe is Nest’s generic “run class-validator on DTOs” pipe.
 * Options:
 * - transform — turn the raw `{ storyId, pageId }` object into StoryPageParams
 *   so @Matches actually runs (without this, the class is never instantiated).
 * - whitelist — drop properties that are not declared on the DTO.
 * - forbidNonWhitelisted — 400 if extra fields show up (more useful for JSON bodies).
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
}
