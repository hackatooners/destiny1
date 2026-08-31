import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module.js';
import { configureApp } from './configure-app.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  // Registers the global ValidationPipe. This lives in configure-app.ts rather than
  // inline because e2e tests build the app with createNestApplication(), which never
  // reads this file — so both entry points must call the same function or the tests
  // would exercise an app that is configured differently from production.
  configureApp(app);

  // Generates OpenAPI docs from the @Api* decorators on controllers and
  // serves an interactive UI at /api to browse/try the endpoints.
  const config = new DocumentBuilder()
    .setTitle('Destiny1 Story API')
    .setDescription('Choose-your-own-adventure reader backend')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
