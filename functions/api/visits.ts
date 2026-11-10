// Cloudflare Pages Function. Requires a D1 binding named VISITOR_DB.
interface Env { VISITOR_DB?: D1Database }
interface Context { request: Request; env: Env }
type Counts = { pv: number; uv: number; postPv: number | null };
const json = (value: object, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});
const validPath = (raw: unknown) => {
  if (typeof raw !== 'string' || raw.length > 240 || !raw.startsWith('/') || raw.startsWith('//')) return null;
  const pathname = raw.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
  if (!/^\/[a-zA-Z0-9_\-./%]*$/.test(pathname) || pathname.includes('..')) return null;
  return pathname;
};
async function counts(db: D1Database, path: string): Promise<Counts> {
  const [site, visitors, post] = await db.batch([
    db.prepare("SELECT views FROM visitor_counters WHERE path = '/'"),
    db.prepare('SELECT COUNT(*) AS total FROM visitor_uniques'),
    db.prepare('SELECT views FROM visitor_counters WHERE path = ?').bind(path),
  ]);
  return {
    pv: Number((site.results?.[0] as { views?: number } | undefined)?.views ?? 0),
    uv: Number((visitors.results?.[0] as { total?: number } | undefined)?.total ?? 0),
    postPv: path.startsWith('/post/') ? Number((post.results?.[0] as { views?: number } | undefined)?.views ?? 0) : null,
  };
}
export const onRequestGet = async ({ request, env }: Context) => {
  if (!env.VISITOR_DB) return json({ error: 'Statistics unavailable' }, 503);
  const path = validPath(new URL(request.url).searchParams.get('path'));
  if (!path) return json({ error: 'Invalid path' }, 400);
  try { return json(await counts(env.VISITOR_DB, path)); }
  catch (error) { console.error('Visitor statistics read failed', error); return json({ error: 'Statistics unavailable' }, 503); }
};
export const onRequestPost = async ({ request, env }: Context) => {
  if (!env.VISITOR_DB) return json({ error: 'Statistics unavailable' }, 503);
  const origin = request.headers.get('origin');
  if (origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Forbidden' }, 403);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'JSON required' }, 415);
  if (/bot|crawler|spider|headless|lighthouse|preview|facebookexternalhit|twitterbot/i.test(request.headers.get('user-agent') ?? '')) {
    return json({ error: 'Automated traffic is not counted' }, 403);
  }
  let body: { path?: unknown; visitor?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const path = validPath(body.path);
  const visitor = body.visitor;
  if (!path || typeof visitor !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitor)) {
    return json({ error: 'Invalid visit' }, 400);
  }
  const hashBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(visitor));
  const visitorHash = Array.from(new Uint8Array(hashBytes), b => b.toString(16).padStart(2, '0')).join('');
  const db = env.VISITOR_DB;
  const now = Math.floor(Date.now() / 1000);
  try {
    // A visitor+path receives at most one page view within a rolling 60-second window.
    // The UPDATE is conditional/atomic, so concurrent requests cannot double count it.
    await db.prepare('INSERT OR IGNORE INTO visitor_visit_locks (visitor_id, path, last_seen) VALUES (?, ?, 0)')
      .bind(visitorHash, path).run();
    const visit = await db.prepare('UPDATE visitor_visit_locks SET last_seen = ? WHERE visitor_id = ? AND path = ? AND last_seen <= ?')
      .bind(now, visitorHash, path, now - 60).run();
    if ((visit.meta?.changes ?? 0) > 0) {
      await db.prepare('INSERT OR IGNORE INTO visitor_uniques (visitor_id, first_seen) VALUES (?, ?)')
        .bind(visitorHash, now).run();
      await db.prepare("INSERT INTO visitor_counters(path, views) VALUES('/', 1) ON CONFLICT(path) DO UPDATE SET views = views + 1").run();
      if (path.startsWith('/post/')) {
        await db.prepare('INSERT INTO visitor_counters(path, views) VALUES(?, 1) ON CONFLICT(path) DO UPDATE SET views = views + 1')
          .bind(path).run();
      }
    }
    return json(await counts(db, path));
  } catch (error) {
    console.error('Visitor statistics write failed', error);
    return json({ error: 'Statistics unavailable' }, 503);
  }
};
