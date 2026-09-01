import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ReadController } from './read.controller.js';
import { observeModules } from './config/observe.js';
import { validateEnv } from './config/env.validation.js';

@Module({
  imports: [
    // MUST stay first: forRoot() loads .env into process.env synchronously
    // (before its first await), so observeModules() below can read it.
    // Array elements evaluate left-to-right — do not reorder.
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      // Tests read only real env vars, never a developer's stray .env, so a
      // local file can never make CI behave differently from a teammate's
      // laptop. Vitest sets NODE_ENV=test itself; nothing to configure.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    ...observeModules(),
  ],
  controllers: [AppController, ReadController],
  providers: [AppService],
})
export class AppModule {}
