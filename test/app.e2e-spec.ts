/**
 * End-to-end tests: real HTTP requests through the real Nest app.
 *
 * Run with `pnpm test:e2e` (vitest.config.e2e.ts, which includes `**\/*.e2e-spec.ts`).
 * Note that `pnpm test` does NOT pick these up: the unit config includes `**\/*.spec.ts`,
 * and `app.e2e-spec.ts` ends in `-spec.ts`, not `.spec.ts`. The two suites are disjoint.
 *
 * These matter more than the unit tests for the path-traversal work, because they are the
 * only thing that proves the hardening is actually WIRED IN. `src/story.paths.spec.ts`
 * passes whether or not anything imports `story.paths.ts` — that was the whole finding of
 * the audit. A request that goes through Express -> the controller -> the service cannot
 * be fooled that way.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/configure-app.js';

describe('AppController (e2e)', () => {
  // Plain INestApplication, not INestApplication<App>. The Nest CLI template imports the
  // App type from 'supertest/types', but supertest ships no "exports" map or "types" field,
  // so that subpath does not resolve under moduleResolution: nodenext and `tsc --noEmit`
  // fails on it. The generic only types getHttpServer()'s return value, and supertest's
  // request() accepts it either way, so dropping it costs nothing.
  let app: INestApplication;

  // beforeAll, not beforeEach: with no Observe credentials in the environment
  // (tests also ignore .env via NODE_ENV=test), no ObserveAgentWorker spawns —
  // but booting one app for the whole file is still faster than ~10 and avoids
  // Vitest hanging on open handles at the end of the run.
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // createNestApplication() does NOT read main.ts, so without this the e2e suite would
    // run against an app with no ValidationPipe — i.e. it would silently fail to test the
    // DTO layer at all. This call is the difference between testing the real app and
    // testing a lookalike.
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/ (GET)', () =>
    request(app.getHttpServer()).get('/').expect(200).expect('Hello World!'));

  describe('happy path', () => {
    it('GET /stories/richard -> 200, the start page named in meta.json', async () => {
      // stories/richard/meta.json is { "start": "a-new-job" }, so this must serve
      // a-new-job.md rather than looking for a file literally named start.md.
      const res = await request(app.getHttpServer())
        .get('/stories/richard')
        .expect(200);
      expect(res.text).toContain('# A New Job');
    });

    it('GET /stories/mari -> 200', async () => {
      // stories/mari/meta.json is { "start": "start" } — the convention spelled out.
      const res = await request(app.getHttpServer()).get('/stories/mari').expect(200);
      expect(res.text).toContain('Mari nacio');
    });

    it('GET /stories/richard/aislop -> 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/stories/richard/aislop')
        .expect(200);
      expect(res.text).toContain('# AI Slop');
    });
  });

  describe('content type: story bodies are labeled text/markdown, not text/html', () => {
    // The bug this guards against is silent regression to Express's default: if the
    // @Header decorators are removed, these responses go back to text/html and browsers
    // start collapsing the markdown's line breaks again — but every other test in this
    // file would still pass, because they only look at the body.
    it.each(['/stories/mari', '/stories/richard', '/stories/richard/aislop'])(
      'GET %s -> Content-Type text/markdown',
      async (path) => {
        const res = await request(app.getHttpServer()).get(path).expect(200);
        expect(res.headers['content-type']).toBe('text/markdown; charset=utf-8');
      },
    );

    it('GET / stays text/html — only file content is markdown', async () => {
      const res = await request(app.getHttpServer()).get('/').expect(200);
      expect(res.headers['content-type']).toContain('text/html');
    });
  });

  describe('missing resources are 404, never 200 with an error string', () => {
    // The original bug was not only traversal: the service RETURNED the string
    // "Error reading file: ..." on any read failure, and Nest serialized that as 200.
    // Callers and caches could not tell success from failure.
    it('GET /stories/richard/no-such-page -> 404', async () => {
      const res = await request(app.getHttpServer())
        .get('/stories/richard/no-such-page')
        .expect(404);
      expect(res.text).not.toContain('Error reading file');
    });

    it('GET /stories/no-such-story -> 404', async () => {
      const res = await request(app.getHttpServer())
        .get('/stories/no-such-story')
        .expect(404);
      expect(res.text).not.toContain('Error reading file');
    });
  });

  /**
   * Path traversal.
   *
   * ENCODING IS THE WHOLE GAME HERE. Most "obvious" traversal strings never even reach
   * the route, so a naive test passes while the app is still wide open:
   *
   *  - supertest/superagent parses the URL with the WHATWG parser (`new URL()`) and sends
   *    `url.pathname`. That parser COLLAPSES real dot-segments client-side. Writing
   *    '/stories/richard/../../README' actually puts '/README' on the wire — the route is
   *    never matched and the test proves nothing. Same for '%2e%2e/' and for backslashes
   *    (WHATWG rewrites '\' to '/' for http(s) URLs).
   *
   *  - '%2F' survives that. Express matches routes against the RAW pathname and only calls
   *    decodeURIComponent() on the captured params afterwards. So '..%2F..%2FREADME' still
   *    matches the two-segment route, and pageId arrives as the literal '../../README'.
   *
   *  - The target must end in '.md', because the service appends it. The PoC in report.txt
   *    ('..%2F..%2Fpackage.json') aims at 'package.json.md', which does not exist — it
   *    demonstrated the 200-on-error bug but never actually disclosed a file.
   *
   * README.md is tracked in git, so these behave identically in CI.
   */
  describe('path traversal', () => {
    const vectors = [
      // Escapes the repo root entirely -> <repo>/README.md.
      '/stories/richard/..%2F..%2FREADME',
      // Same escape, but via the single-segment route (storyId is the tainted param).
      '/stories/..%2F..%2FREADME',
      // Climbs out and back IN to a real file that is still under stories/. Containment
      // checks (realpath + "is it inside STORIES_ROOT") let this through — only the slug
      // regex stops it. This is the regression test for "don't delete isStorySlug".
      '/stories/richard/..%2F..%2Fstories%2Fmari%2Fstart',
      '/stories/richard/..%2Fmari%2Fstart',
    ];

    it.each(vectors)('%s does not disclose a file', async (path) => {
      const res = await request(app.getHttpServer()).get(path);

      // 400, not 404: every vector here is a malformed slug, so the global ValidationPipe
      // rejects it before the request ever reaches AppService. If the DTO layer were
      // removed, these would become 404 from resolveStoryPageFile() instead — still safe,
      // which is the point of keeping the security check in the service.
      expect(res.status).toBe(400);

      // The status alone is weak evidence — a 400 could be thrown for any reason. THESE
      // are what actually prove non-disclosure, and they hold regardless of status code.
      expect(res.text).not.toContain('<p align="center">'); // README.md
      expect(res.text).not.toContain('Mari nacio'); // stories/mari/start.md
      expect(res.text).not.toContain('Error reading file');
    });

    it('a NUL byte is rejected cleanly, not as a 500', async () => {
      // Without a slug check, realpathSync() throws ERR_INVALID_ARG_VALUE rather than
      // ENOENT/ENOTDIR, and story.paths.ts deliberately re-throws anything that is not a
      // missing-file error — so this would surface as a 500. Proves the shape check runs
      // BEFORE the filesystem is touched.
      await request(app.getHttpServer()).get('/stories/richard/aislop%00').expect(400);
    });
  });
});
