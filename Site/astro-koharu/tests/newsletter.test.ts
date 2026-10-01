import assert from 'node:assert/strict';
import test from 'node:test';
import type { BlogPost } from 'types/blog';
import { getNewsletterPosts, groupNewsletterPosts } from '../src/lib/newsletter';
import { getNewsletterIssue, newsletterSchema } from '../src/lib/newsletter-schema';

function post(issue: string, kind: 'digest' | 'long-read', date: string, draft = false): BlogPost {
  return {
    id: `${issue}-${kind}`,
    collection: 'blog',
    data: {
      title: issue,
      date: new Date(date),
      draft,
      newsletter: { issue, kind, periodStart: '2026-09-26', periodEnd: '2026-10-02' },
    },
  } as BlogPost;
}

test('metadata rejects impossible dates, reversed windows and malformed editions', () => {
  const metadata = { kind: 'digest', issue: '2026-W40', periodStart: '2026-09-26', periodEnd: '2026-10-02' };
  assert.equal(newsletterSchema.safeParse(metadata).success, true);
  for (const invalid of [
    { periodStart: '2026-02-29' },
    { periodStart: '2026-10-03' },
    { issue: '2026-W54' },
    { kind: 'news' },
  ]) {
    assert.equal(newsletterSchema.safeParse({ ...metadata, ...invalid }).success, false);
  }
  assert.equal(newsletterSchema.safeParse({ ...metadata, periodStart: '2024-02-29' }).success, true);
});

test('archive keeps both edition types, sorts across ISO years and excludes drafts', () => {
  const posts = [
    post('2026-W53', 'digest', '2027-01-01'),
    post('2027-W01', 'digest', '2027-01-08'),
    post('2026-W53', 'long-read', '2027-01-02'),
    post('2027-W02', 'digest', '2027-01-15', true),
  ];
  const result = groupNewsletterPosts(posts);
  assert.deepEqual(
    result.map((group) => group.issue),
    ['2027-W01', '2026-W53'],
  );
  assert.equal(result[1].posts.length, 2);
  assert.equal(getNewsletterPosts(posts).length, 3);
  assert.equal(posts.length, 4);
});

test('published retries with duplicate kind and issue stop the build', () => {
  const first = post('2026-W40', 'digest', '2026-10-02');
  assert.throws(() => getNewsletterPosts([first, { ...first, id: 'duplicate' }]), /Duplicate newsletter/);
  assert.doesNotThrow(() => getNewsletterPosts([first, post('2026-W40', 'digest', '2026-10-02', true)]));
});

test('ISO editions use week-year at New Year and validate the 53rd week', () => {
  assert.equal(getNewsletterIssue('2027-01-01'), '2026-W53');
  assert.equal(getNewsletterIssue('2027-01-04'), '2027-W01');
  assert.equal(getNewsletterIssue('2026-10-02'), '2026-W40');
  const metadata = { kind: 'digest', issue: '2025-W53', periodStart: '2025-12-26', periodEnd: '2025-12-31' };
  assert.equal(newsletterSchema.safeParse(metadata).success, false);
  assert.equal(newsletterSchema.safeParse({ ...metadata, issue: '2026-W53' }).success, true);
});
