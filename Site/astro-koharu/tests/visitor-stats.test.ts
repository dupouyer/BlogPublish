import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const { onRequestGet, onRequestPost } = createRequire(import.meta.url)(
  '../../../functions/api/visits.ts',
) as typeof import('../../../functions/api/visits');

const origin = 'https://stats.example';
const visitor = '00000000-0000-4000-8000-000000000001';
const migration = readFileSync(new URL('../../../migrations/0001_visitors.sql', import.meta.url), 'utf8');

// Execute the real SQL against SQLite; batch has D1's transaction/rollback semantics.
function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(migration);
  function prepare(sql: string) {
    const statement = {
      sql,
      args: [] as (string | number)[],
      bind(...args: (string | number)[]) {
        return { ...statement, args };
      },
      async run() {
        return { meta: sqlite.prepare(sql).run(...this.args) };
      },
    };
    return statement;
  }
  const db = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(({ sql, args }) => ({ results: sqlite.prepare(sql).all(...args) }));
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return {
    sqlite,
    env: { VISITOR_DB: db as unknown as NonNullable<Parameters<typeof onRequestPost>[0]['env']['VISITOR_DB']> },
  };
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/visits`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0', ...headers },
    body: JSON.stringify(body),
  });
}

test('counts site PV, lifetime UV and separate article PV with a 60-second boundary', async (t) => {
  const { sqlite, env } = database();
  t.after(() => sqlite.close());
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const visit = async (path: string, id = visitor) =>
    (await onRequestPost({ env, request: request({ path, visitor: id }) })).json();
  assert.deepEqual(await visit('/post/first/'), { pv: 1, uv: 1, postPv: 1 });
  now += 59_000;
  assert.deepEqual(await visit('/post/first'), { pv: 1, uv: 1, postPv: 1 });
  now += 1_000;
  assert.deepEqual(await visit('/post/first'), { pv: 2, uv: 1, postPv: 2 });
  assert.deepEqual(await visit('/post/second'), { pv: 3, uv: 1, postPv: 1 });
  assert.deepEqual(await visit('/', '00000000-0000-4000-8000-000000000002'), { pv: 4, uv: 2, postPv: null });
  const read = () => onRequestGet({ env, request: new Request(`${origin}/api/visits?path=/post/first`) });
  assert.deepEqual(await (await read()).json(), { pv: 4, uv: 2, postPv: 2 });
  assert.deepEqual(await (await read()).json(), { pv: 4, uv: 2, postPv: 2 });
  const concurrent = await Promise.all(Array.from({ length: 8 }, () => visit('/post/concurrent')));
  assert.ok(concurrent.every((counts) => counts.pv === 5 && counts.postPv === 1 && counts.uv === 2));
});

test('rejects malformed input and cross-site/bot requests without changing counts', async (t) => {
  const { sqlite, env } = database();
  t.after(() => sqlite.close());
  for (const body of [null, [], 1, 'bad', {}, { path: '//bad', visitor }, { path: '/', visitor: 'invalid' }]) {
    assert.equal((await onRequestPost({ env, request: request(body) })).status, 400);
  }
  for (const headers of [
    { origin: 'https://other.example' },
    { 'sec-fetch-site': 'cross-site' },
    { 'user-agent': 'Googlebot' },
  ]) {
    assert.equal((await onRequestPost({ env, request: request({ path: '/', visitor }, headers) })).status, 403);
  }
  assert.equal(
    (await onRequestPost({ env, request: request({ path: '/', visitor }, { 'content-type': 'text/plain' }) })).status,
    415,
  );
  assert.equal((await onRequestGet({ env: {}, request: new Request(`${origin}/api/visits?path=/`) })).status, 503);
  assert.deepEqual(await (await onRequestGet({ env, request: new Request(`${origin}/api/visits?path=/`) })).json(), {
    pv: 0,
    uv: 0,
    postPv: null,
  });
});

test('failed article write rolls back the site count, UV and visit lock so a retry can count', async (t) => {
  const { sqlite, env } = database();
  t.after(() => sqlite.close());
  sqlite.exec(
    "CREATE TRIGGER fail_post BEFORE INSERT ON visitor_counters WHEN NEW.path = '/post/failure' BEGIN SELECT RAISE(FAIL, 'test write failure'); END",
  );
  assert.equal((await onRequestPost({ env, request: request({ path: '/post/failure', visitor }) })).status, 503);
  for (const table of ['visitor_counters', 'visitor_uniques', 'visitor_visit_locks']) {
    assert.equal(sqlite.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get()?.total, 0);
  }
  sqlite.exec('DROP TRIGGER fail_post');
  assert.deepEqual(await (await onRequestPost({ env, request: request({ path: '/post/failure', visitor }) })).json(), {
    pv: 1,
    uv: 1,
    postPv: 1,
  });
});

test('home page renders counts and a failed POST does not suppress the next attempt', async () => {
  const elements = new Map(['pv', 'uv', 'post'].map((key) => [`[data-visitor-${key}]`, { textContent: '—' }]));
  const listeners = new Map<string, () => Promise<void>>();
  const storage = new Map<string, string>();
  const methods: string[] = [];
  let available = false;
  const document = {
    readyState: 'loading',
    addEventListener: (event: string, callback: () => Promise<void>) => listeners.set(event, callback),
    querySelectorAll: (selector: string) => [elements.get(selector)],
  };
  runInNewContext(readFileSync(new URL('../public/js/visitor-stats.js', import.meta.url), 'utf8'), {
    document,
    location: { pathname: '/' },
    crypto: { randomUUID: () => visitor },
    Intl,
    localStorage: { getItem: () => visitor },
    sessionStorage: {
      getItem: (key: string) => storage.get(key),
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    fetch: async (_url: string, options: { method: string }) => {
      methods.push(options.method);
      return { ok: available, json: async () => ({ pv: 7, uv: 3, postPv: null }) };
    },
  });
  await listeners.get('astro:page-load')?.();
  available = true;
  await listeners.get('astro:page-load')?.();
  assert.deepEqual(methods, ['POST', 'POST']);
  assert.equal(elements.get('[data-visitor-pv]')?.textContent, '7');
  assert.equal(elements.get('[data-visitor-uv]')?.textContent, '3');
});
