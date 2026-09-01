# Destiny1 Story API

Choose-your-own-adventure story reader backend, built with [NestJS](https://nestjs.com) as a learning project. Serves markdown pages from the `stories/` directory (each story has a `meta.json` naming its start page) as `text/markdown`. Interactive API docs at `/api`.

## Setup

```bash
$ pnpm install
```

## Run

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Configuration

Copy [.env.example](.env.example) to `.env` (gitignored) and fill in what you need; real environment variables take precedence over the file. Leave the `OBSERVE_*` variables unset to run without telemetry.
