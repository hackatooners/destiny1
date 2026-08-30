# Multi-story architecture — proposed solutions

How to go from one hardcoded story to N stories, still authored as markdown, and where
the files should live. Every claim below was verified against this repo (Nest 12, ESM,
pnpm, Node 26) — anything unverified is marked.

---

## 0. Baseline: what is true today

| Fact | Where |
|---|---|
| One story at repo-root `story/` — `start.md`, `end1.md`, `end2.md` | `story/` |
| Page path is `join(import.meta.dirname, '..', 'story', \`${fileName}.md\`)` | `src/app.service.ts:17` |
| Everything lives in one flat `AppModule` (`getHello` + story reads in `AppService`) | `src/app.module.ts` |
| `nest-cli.json` has **no** `assets` entry → no `.md` ever reaches `dist/` | `nest-cli.json` |
| `tsconfig.build.json` sets `rootDir: ./src` → `dist/` is **flat** (`dist/app.service.js`) | `tsconfig.build.json` |
| No test touches `/start` or `/page/:fileName` — only `GET /` is asserted | `test/app.e2e-spec.ts`, `src/app.controller.spec.ts` |
| Deps are only nest core/swagger/rxjs/reflect-metadata — no config, YAML, or markdown parser | `package.json` |
| `nest deploy` (@nestjs/mau) generates `COPY . .` → repo-root `story/` **already ships** | `@nestjs/mau/lib/factories/inline-application-dockerfile.factory.js` |

Why `'..'` works today: `src/` and `dist/` are both exactly one level below the repo root,
so `'..'` lands on the repo root under **both** vitest and `node dist/main`. That symmetry
is a coincidence, not a design — see bug #4.

The old `fin1.md` / `fin2.md` dangling-link bug is **gone**. `start.md` links to `end1.md`
and `end2.md`, and both exist.

---

## 1. Four cross-cutting defects any option must handle

These are independent of which solution you pick. Two of them are live bugs.

### #1 — Path traversal is exploitable *(verified end to end)*

`GET /page/..%2FREADME1` returns the contents of `README1.md`, a file outside `story/`.

Verified in three links, without starting the server:

1. `path-to-regexp@8.4.2` (the copy in `node_modules`) decodes route params, and `%2F`
   does **not** break the single-segment match:
   ```
   /page/end1              -> { fileName: "end1" }
   /page/..%2FREADME1      -> { fileName: "../README1" }
   /page/%2e%2e%2fREADME1  -> { fileName: "../README1" }
   /page/../README1        -> NO MATCH   (raw ".." is normalized by the URL layer)
   ```
2. The path expression then escapes the story dir:
   ```
   "end1"            -> <repo>/story/end1.md
   "../README1"      -> <repo>/README1.md        <-- outside story/
   "../../etc/passwd"-> <repo>/../etc/passwd.md
   ```
3. Importing the compiled `dist/app.service.js` and calling `getPage('../README1')`
   returns the README text.

**Scope:** arbitrary read of any `.md` file readable by the process, anywhere on disk.
The forced `${fileName}.md` suffix is a real constraint (`%00` truncation does not work —
Node `fs` rejects NUL in paths), so `/etc/passwd` itself is not reachable. Severity:
medium (info disclosure). It gets worse with multi-story, because the natural route
`/stories/:storyId/pages/:pageId` has **two** params to sanitize.

### #2 — Every miss is HTTP 200

`src/app.service.ts:21-24` catches and returns `"Error reading file: X.md"` with a 200 and
a `console.error` on the hot path. Swagger advertises that response as `Raw markdown`.
Consequence: a traversal probe and a real page look identical to a client or a cache —
which is exactly what keeps bug #1 quiet.

### #3 — `.md` extension mismatch between content and routes

`start.md` writes `[buceo profesional](end1.md)`, but `@ApiParam` documents `fileName` as
"without extension". A client following the link target verbatim calls `GET /page/end1.md`
→ reads `story/end1.md.md` → 200 with an error string. Somebody has to strip `.md`:
either every client, or the server once.

### #4 — `import.meta.dirname + '..'` is depth-coupled

It works only while the service sits at the top of `src/`. **Move it to
`src/story/story.service.ts` and it compiles to `dist/story/story.service.js`, where
`'..'/'story'` resolves to `dist/story` — the code directory — silently.** Any solution
below that creates a subdirectory must fix the path base *first*.

### Bonus — `Content-Type` is `text/html`

Nest's Express adapter calls `res.send(String(body))`; Express 5 defaults an unset
content type to HTML. So markdown is served as HTML today, and
`@ApiOkResponse({ type: String })` documents it as `application/json` — both wrong.
Only a security concern if stories ever become user-submitted.

---

## 2. Proposed solutions

Ordered least → most invasive. Each is a complete, coherent end state.

---

### S1 — "Nest the folder, change one line"

The absolute minimum that unlocks N stories.

```
story/
  mari/        start.md  end1.md  end2.md     # today's three files, moved down one level
  hipotecas/   start.md  ...
src/           (unchanged shape)
```

```ts
// src/app.service.ts — the literal 'story' token and the '..' hop are untouched
const filePath = join(import.meta.dirname, '..', 'story', storyId, `${pageId}.md`);
```

- **Routes:** `GET /stories` (listing via `readdirSync(root, { withFileTypes: true })`),
  `GET /stories/:storyId/pages/:pageId`. Keep `/start` + `/page/:f` as aliases to a
  default story, or delete them (no test covers them).
- **Build/deploy:** nothing. No `nest-cli.json` change, no env var. mau's `COPY . .` still
  ships the content.
- **Pros:** smallest possible diff; zero new deps or files; the `'..'` depth trap is
  dodged because nothing moves into a subdirectory; markdown edits stay live with no
  restart (per-request `readFileSync`, no cache).
- **Cons:** `story/` is singular for N stories; `AppService` becomes a grab-bag; bugs
  #1–#3 remain unless fixed inline; `dist/` still isn't self-contained.
- **Pick when:** you want several stories working this afternoon and will iterate.

---

### S2 — S1 + plural rename + hardening  ← *recommended baseline*

Same shape as S1, with the four defects closed and path knowledge centralized.

```
stories/
  mari/       start.md  end1.md  end2.md
  hipotecas/  start.md  ...
src/
  app.module.ts  app.controller.ts  app.service.ts
  story.paths.ts      # single owner of the root path
```

```ts
// src/story.paths.ts — one place that knows where content lives
export const STORIES_ROOT = process.env.STORIES_ROOT
  ? resolve(process.env.STORIES_ROOT)
  : join(import.meta.dirname, '..', 'stories');

// resolve-and-verify — closes traversal regardless of encoding
const p = resolve(STORIES_ROOT, storyId, `${pageId}.md`);
if (!p.startsWith(STORIES_ROOT + sep)) throw new NotFoundException();
//                              ^^^^^ the `+ sep` matters: bare startsWith lets
//                                    a sibling `stories-evil/` through
```

Plus: slug regex `/^[a-z0-9][a-z0-9-]*$/` on both params (a small pipe, or
`@ApiParam({ schema: { pattern } })` for self-documenting Swagger); `ENOENT →
NotFoundException`, other errno rethrown; `console.error` → Nest `Logger.warn`;
strip `.md` from link targets in one place.

- **Build/deploy:** still nothing required. The `STORIES_ROOT` env var is an opt-in
  escape hatch (3 lines) that also lets tests point at fixtures.
- **Pros:** everything S1 has, plus correct 404s and no traversal; one place owns the
  path, so bug #4 can't resurface; plural directory name; sets up S3 for free.
- **Cons:** renames the directory (a mild path change — flagged because you previously
  declined moving story files); slightly more code than S1.
- **Pick when:** default. This is S1 done properly, for maybe 30 extra lines.

---

### S3 — Extract `StoryModule`, index metadata at boot, return parsed choices

The "this is a real app now" option.

```
src/
  main.ts  app.module.ts  app.controller.ts  app.service.ts   # health only
  story/
    story.module.ts        # StoryModule.forRoot({ root })  — mirrors ObserveModule.forRoot
    story.controller.ts    # @Controller('stories')
    story.service.ts
    story.constants.ts     # STORIES_ROOT injection token
    markdown-page.parser.ts
    dto/{story-summary,page,choice}.dto.ts
stories/<slug>/*.md
```

**Loading strategy — index metadata eagerly, read bodies lazily.** `OnModuleInit` scans
for story ids + titles; page *bodies* are still read per request.

- ids become **map keys, never concatenated into a path** → traversal impossible by
  construction, no regex needed
- `GET /stories` with titles falls out for free
- page text stays live-editable (the property S1/S2 have and a full cache would destroy)
- cost is one `readdir` at boot — microseconds at this scale

**Response shape** becomes JSON, which is the point of a reader UI:

```json
GET /stories/mari/pages/start
{
  "storyId": "mari", "id": "start",
  "body": "Mari nacio,\ntenia que elegir una profesion para laburar\neligio:",
  "choices": [
    { "label": "buceo profesional", "target": "end1", "href": "/stories/mari/pages/end1" },
    { "label": "gestion de hipotecas bancarias", "target": "end2", "href": "/stories/mari/pages/end2" }
  ],
  "isEnding": false
}
```

`isEnding` = `choices.length === 0`, which is currently the only way to know `end1.md` is
terminal. Emitting a ready-made `href` fixes bug #3 once, server-side, instead of in every
client. Keep `body` as markdown — rendering HTML server-side would add an XSS surface.

- **⚠ Must fix the path base first** (bug #4): moving into `src/story/` breaks `'..'`.
- **Swagger:** real schemas via `@ApiOkResponse({ type: PageDto })` instead of
  `type: String`. There's no `@nestjs/swagger/plugin` in `nest-cli.json`, so every DTO
  field needs a hand-written `@ApiProperty()` — worth adding the plugin past ~2 DTOs.
- **Pros:** clean module seam; listing + id validation + choice parsing all from one
  index; the API becomes something a UI can consume without parsing markdown; still zero
  new runtime deps (a link regex is ~5 lines).
- **Cons:** the API now owns the markdown dialect — a story writing choices as a table, or
  an inline link mid-paragraph, silently yields `choices: []`; adding a story still needs a
  restart to appear in the index (mitigate: stat-based invalidation, or index lazily);
  `title` has no source in the current files (no H1, no frontmatter) — you must add one to
  the format, derive it from the first line, or drop the field rather than fabricate it.
- **Pick when:** you control the client and want buttons for choices — i.e. the actual
  point of a choose-your-own-adventure reader.

---

### S4 — `src/stories/` + `nest-cli.json` assets → self-contained `dist/`

```
src/stories/<slug>/*.md
```
```jsonc
// nest-cli.json
"compilerOptions": {
  "deleteOutDir": true,
  "assets": ["stories/**/*.md"],   // glob is relative to sourceRoot (src/)
  "watchAssets": true
}
```
```ts
const filePath = join(import.meta.dirname, 'stories', storyId, `${pageId}.md`); // no '..'
```

This is the one layout where **source and dist paths converge**: `src/stories` under
vitest, `dist/stories` in production, identical expression, bug #4 gone by construction.

- **Nest CLI gotcha (verified in source):** asset globs resolve relative to `sourceRoot`,
  and the destination strips exactly `sourceRoot.split(sep).length` segments
  (`assets-manager.js:246` + `copy-path-resolve.js`). A glob of `"../stories/**/*.md"`
  flattens `<repo>/stories/mari/start.md` to `dist/start.md` — the directory is eaten.
  To keep content outside `src/` you **must** set an explicit `"outDir": "dist/stories"`.
- **Pros:** `dist/` is a genuinely deployable artifact, so a slim multi-stage
  `COPY --from=builder /app/dist` image works; `watchAssets` restarts dev on `.md` change.
- **Cons:** **this is the copy-into-`dist` approach you already rejected**; prose lives
  under `src/` next to code; `deleteOutDir: true` means a failed asset copy yields a
  story-less build; content is duplicated on disk.
- **Pick when:** only if a slim deploy image becomes a hard requirement. You don't need it
  today — mau's `COPY . .` already ships repo-root content.

---

### S5 — Content decoupled: external `STORIES_ROOT`, mounted at runtime

`STORIES_ROOT=/var/lib/destiny/stories`, falling back to the in-repo dir. Discovery is a
directory scan; new stories appear without a redeploy.

- **Pros:** content ships independently of code; a non-developer can publish a story;
  read-only rootfs is fine (mount the volume read-only too); trivially points tests at
  fixtures.
- **Cons:** a whole operational concern (who mounts what, where) for a hobby project;
  un-versions the content — you lose git diffs and review; a missing/empty dir becomes a
  runtime failure with no build-time signal; **widens the traversal surface**, so slug and
  page must be allowlisted against the scan, never concatenated blindly.
- **Pick when:** not yet. But the *env-var override with a sane default* (already in S2)
  costs 3 lines and makes this a config change later instead of a refactor.

---

### S6 — One file per story (alternative content shape, composes with S1–S3)

```
stories/
  mari.md         # all pages in one file, delimited by `## start`, `## end1`, ...
  hipotecas.md
```
Links become anchors: `[buceo profesional](#end1)`.

- **Pros:** a story is one reviewable, diffable, `git mv`-able artifact; no orphan files
  possible; natural home for a frontmatter header at the top.
- **Cons:** forces a parser you don't otherwise need, plus a cache (re-splitting the whole
  file per request is wasteful); requires rewriting every existing link; coarser HTTP
  caching per page; merge conflicts concentrate in one file.
- **Pick when:** stories stay short (today's are 1–2 lines) and authors prefer one file
  over a folder.

---

## 3. Orthogonal menus — mix and match

### Where does the folder go?

| Location | Build config needed | Notes |
|---|---|---|
| `story/<slug>/` (S1) | none | keeps the literal path token — smallest possible change |
| `stories/<slug>/` (S2) | none | plural; a mild rename |
| `src/stories/` (S4) | **assets entry required** | only layout where src and dist paths match |
| repo-root + `outDir` (S4 variant) | **assets + explicit `outDir`** | segment-stripping bites without it |
| external `$STORIES_ROOT` (S5) | env var + volume | content stops being git-tracked |

### Identifying the start page

| Choice | Cost | Trade-off |
|---|---|---|
| Convention `start.md` | zero — matches today | filename is load-bearing |
| Convention `index.md` | one rename | web-idiomatic; otherwise identical |
| Declared in a manifest | manifest read + validation | authors name it freely; one more failure mode |
| Computed (no inbound links) | full graph scan | ambiguous for cycles — anti-option |

### Per-story metadata

| Choice | New deps | Trade-off |
|---|---|---|
| None (slug = folder, title = first `#`) | none | **today's `start.md` has no heading** — titles fall back to the slug |
| `story.json` per story | none | zero-dep, easy to validate; a second file per story |
| YAML frontmatter | a parser (or a ~20-line `---` split) | metadata travels with the page; every consumer must decide whether to strip it |
| Global `stories/index.json` | none | one cheap read + curated ordering; two edits per story, guaranteed drift |
| **Scan + optional override file** | none | "drop a folder in and it appears"; must define defaults for missing fields |

### How choices are expressed

- **C1 — status quo, client parses.** No content change; every client reimplements link
  extraction and has to handle bug #3 itself.
- **C2 — status quo authoring, server extracts.** *Best fit if you don't want to touch
  content.* Same `.md` files; API returns `choices[]`. Needs a disambiguation rule (e.g.
  only links whose target ends in `.md`) so an inline prose link isn't mistaken for a
  choice. Endings fall out free: `end1.md` yields zero choices.
- **C3 — frontmatter `choices:` array.** Unambiguous, and the only form with room for
  per-choice conditions/inventory later. Rewrites every page; files stop being
  self-contained clickable documents; adds a YAML parser.
- **C4 — hybrid** (frontmatter if present, else links). Migration-friendly, two code paths.
- **Scope:** keep targets story-relative (`end1.md` → `/stories/<slug>/pages/end1`) so
  story folders stay self-contained. Reserve a syntax for cross-story jumps; don't build it.

**Decide this in step 1.** Every validator, test, and client depends on it, and changing
it later means rewriting all content.

### URL design

| Option | Verdict |
|---|---|
| `GET /page/end1?story=mari` | smallest diff, but story id isn't identity — two stories' `end1` share a cache key |
| `GET /page/mari--end1` | **verified to parse**, but `/page/end1` then 404s and `a--b--c` splits as `{a--b, c}`. A made-up encoding nobody will guess |
| Header / session `X-Story-Id` | **avoid** — responses stop being cacheable or shareable by URL; needs `Vary` everywhere; converts a stateless read into ambient state |
| `GET /stories/:storyId/pages/:pageId` | **the default answer** — conventional, cacheable, permalinkable, self-describing in Swagger |

**GET vs POST stays GET.** Fetching a page is safe, idempotent and cacheable no matter how
many stories exist; readers must be able to bookmark, share, and back-button. Multi-story
changes how a resource is *addressed*, not whether reading it mutates anything. The only
thing that would change the answer is session-scoped state — which is an argument against
the header option, not for POST.

### Backward compatibility for `/start` and `/page/:fileName`

Nothing in the repo tests or consumes them (verified), so the usual pressure doesn't exist.

- **Keep as aliases** to a default story — zero breakage, two permanently ambiguous URLs.
  Mark `@ApiOperation({ deprecated: true })` for strike-through in Swagger UI.
- **Redirect** — note Nest's `@Redirect()` defaults to **302**; pass `308` explicitly.
- **Delete** — honest and cheap here.

Whichever you pick, `test/app.e2e-spec.ts` and `src/app.controller.spec.ts` need **no
edits** — every option is additive. What you should *add*: an e2e asserting an unknown
page is a 404 (not a 200 with an error string), and one asserting
`GET /page/..%2FREADME1` is 400/404. That second test is the regression guard for #1 and
it fails today.

### Content validation (a broken link is easy to miss past ~3 files)

- **Floor, do this always:** throw `NotFoundException`. The current 200-on-error actively
  hides the failures you're trying to catch.
- **`pnpm validate:stories` script** (~50 lines, no deps, `node --experimental-strip-types`
  works on Node 26): walk `stories/*/`, regex the links, resolve targets, walk the graph
  from `start.md`. Catches broken links, missing starts, orphans, unreachable endings.
  Runnable mid-authoring; exit code is the whole contract. **Best value.**
- **Boot-time check:** the only thing that catches *packaging* failures (content missing
  from the image). Keep it `warn`-only — a `throw` turns one typo into total downtime.
- **Vitest walker:** zero new tooling, but couples `pnpm test` to authored prose. If you
  do it, put it behind a separate config (`pnpm test:content`) so a typo in a story doesn't
  fail someone's unrelated TS work.
- **CI:** no `.github/` exists. Worth adding once more than one person writes stories.

### Testing

- **Fixtures on disk at `test/fixtures/stories/`** — default choice. Include
  deliberately-broken fixtures (`broken-link/`, `no-start/`) so you can assert 404 and
  validator behaviour. Requires the `STORIES_ROOT` injection seam from S2, overridden via
  `.overrideProvider(STORIES_ROOT)`. Keep fixtures out of `src/` so an `assets` glob never
  ships them to production.
- Avoid `vi.mock('fs')` except for narrow errno cases — `readFileSync` is a named ESM
  import (fiddly to mock), and path-assertion tests pass while the real join is wrong,
  which is *precisely* today's bug class.
- `test/app.e2e-spec.ts` recreates the whole `AppModule` per test, spawning an
  `ObserveAgentWorker` thread each time. Switch to `beforeAll`/`afterAll` before adding
  cases. *(Unverified: whether Observe attempts outbound network with the placeholder
  `YOUR_APP_KEY` credentials — worth checking first.)*

### Authoring ergonomics & hot reload *(verified)*

- `nest start --watch` uses `ts.createWatchCompilerHost`, which watches only files in the
  TS program — **markdown edits never trigger a restart**. Asset watching is a *separate*
  `--watchAssets` flag, not implied by `--watch`.
- It doesn't matter today: `readFileSync` per request with no cache means edits are live on
  the next refresh, in dev *and* prod. **This is the best ergonomic property of the current
  design and it's easy to destroy accidentally.**
- So if you add an index or cache: cache the *listing*, not page bodies (S3's approach); or
  invalidate on `statSync().mtimeMs`; or cache only when `NODE_ENV === 'production'`.
  Honestly — a `readdir` over ~10 dirs is sub-millisecond, so don't cache until you measure
  a problem.

---

## 4. Comparison

| | Folder moves? | Build config | New deps | Fixes #1–#4 | Effort |
|---|---|---|---|---|---|
| **S1** Nest the folder | one level down | none | none | no | ~30 min |
| **S2** + rename + harden | + rename to plural | none | none | **yes** | ~2 h |
| **S3** StoryModule + index + DTOs | same as S2 | none | none | **yes** | ~1 day |
| **S4** `src/stories/` + assets | into `src/` | **assets entry** | none | yes (#4 structurally) | ~3 h |
| **S5** External root | out of repo | env + volume | none | needs care on #1 | ~half day |
| **S6** One file per story | content rewrite | none | parser | orthogonal | ~half day |

---

## 5. Suggested path

1. **S2 now.** It's S1 plus roughly 30 lines, and it closes a live arbitrary-file-read bug
   along the way. Do the parameterization and the sanitizing in the *same* change — the
   traversal surface doubles the moment you add a second path param, so they shouldn't be
   separate commits.
2. **Then S3's listing endpoint** when you want a story picker. Index *metadata only*, keep
   body reads lazy — you get free id validation and keep live editing.
3. **Then metadata** (`story.json` is the zero-dep option) once you need real titles.
   Today's `start.md` has no heading, so any listing endpoint has nothing to show but the
   slug until this exists.
4. **S4 only if** you move off mau's `COPY . .` to a slim image. **S5 only if** a
   non-developer needs to publish without a git push.

Skip the `StoryRepository` port for now. There is exactly one implementation and three
markdown files; an interface designed against the fs adapter will very likely be wrong for
the second backend (no pagination, no search, no partial fetch). Nest already gives you the
testing benefit without it — `.overrideProvider(StoryService).useValue(fake)` swaps a
concrete class fine, and a class is its own DI token. Cheap insurance that costs nothing:
keep **every** `fs` call inside one private method of one file, and extract-interface later
is a mechanical 20-minute change.

### Scale ceiling — for reference

Flat markdown on disk stays correct far longer than it feels like it should. 100 stories ×
20 pages × 2 KB ≈ 4 MB; a full link-graph walk over 2,000 files is milliseconds. The real
ceiling is **editorial, not technical**, and arrives around 20–50 stories: you want search,
drafts vs. published, tags, and non-developers editing without a git push. When it does,
the next step is `node:sqlite` (built into Node 26, zero deps) as an *index over* the
markdown, with files remaining the source of truth — not a CMS, and not object storage.

---

## Appendix — unrelated findings

- `@nestjs/mau` deploys with `npm install --no-audit --legacy-peer-deps` and only copies
  `package*.json`. There is no `package-lock.json` here, so deployed images resolve
  dependencies fresh and **ignore `pnpm-lock.yaml`** — deploys aren't reproducible.
- `COPY . .` also copies local `node_modules/` and `dist/` into the build context before
  installing and rebuilding. A `.dockerignore` (`node_modules`, `dist`, `.git`) is a cheap
  win — but it must **not** exclude the stories directory under S1/S2/S3.
- `tsconfig.build.tsbuildinfo` (198 KB) is tracked in git and not in `.gitignore`.
- `@ApiTags('story')` is on the root controller, so the `GET /` health check is filed under
  "story" in Swagger.
- `ObserveModule.forRoot` still has placeholder `YOUR_APP_KEY` / `YOUR_APP_SECRET`
  credentials in `src/app.module.ts`.
