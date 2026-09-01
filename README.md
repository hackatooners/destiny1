# Destiny1 Story API

Choose-your-own-adventure story reader backend, built with [NestJS](https://nestjs.com) as a learning project. Stories are markdown pages under `stories/` (each story has a `meta.json` naming its start page and title).

## Routes

For humans (server-rendered HTML, no client JS):

- `GET /` — story index
- `GET /read/:storyId` — a story's start page
- `GET /read/:storyId/:pageId` — one page; `[text](page.md)` links are rewritten to reader URLs

For machines (interactive docs at [`/api`](http://localhost:3000/api)):

- `GET /health` — liveness message
- `GET /stories/:storyId` and `GET /stories/:storyId/:pageId` — raw markdown as `text/markdown`

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
