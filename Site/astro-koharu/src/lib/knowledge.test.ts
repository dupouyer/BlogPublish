import assert from 'node:assert/strict';
import test from 'node:test';
import type { BlogPost } from '@/types/blog';
import { getArticleReadingInfo, getCollectionPosts, getLearningPosts, validateKnowledge } from './knowledge';

const post = (link: string, metadata: Partial<BlogPost['data']> = {}): BlogPost => ({
  id: link,
  collection: 'blog',
  data: {
    title: link,
    date: new Date('2026-10-01'),
    link,
    ...metadata,
    catalog: metadata.catalog ?? true,
    tocNumbering: metadata.tocNumbering ?? true,
  },
  body: '',
});
const first = post('foundation', { series: { id: 'linear-algebra-for-ta', order: 1, stage: 'geometry' } });
const second = post('application', {
  date: new Date('2026-09-01'),
  series: { id: 'linear-algebra-for-ta', order: 2, stage: 'coordinates' },
  collection: ['normal-mapping', 'foliage'],
  prerequisites: ['foundation'],
});

test('learning order survives date changes and missing order numbers', () => {
  const third = post('later', { series: { id: 'linear-algebra-for-ta', order: 7, stage: 'applications' } });
  assert.deepEqual(
    getLearningPosts([third, second, first], 'linear-algebra-for-ta').map((item) => item.id),
    ['foundation', 'application', 'later'],
  );
  assert.deepEqual(getLearningPosts([first], 'missing'), []);
});

test('topic membership is independent of series and allows multiple topics', () => {
  assert.deepEqual(
    getCollectionPosts([first, second], 'normal-mapping').map((item) => item.id),
    ['application'],
  );
  assert.deepEqual(
    getCollectionPosts([first, second], 'foliage').map((item) => item.id),
    ['application'],
  );
  assert.deepEqual(getCollectionPosts([first, second], 'realtime-glass'), []);
});

test('validation rejects ambiguous order, hidden dependencies and cycles', () => {
  assert.doesNotThrow(() => validateKnowledge([second, first]));
  assert.throws(() => validateKnowledge([first, post('duplicate', { series: first.data.series })]), /duplicate series order/);
  assert.throws(
    () =>
      validateKnowledge([
        second,
        post('backtrack', { series: { id: 'linear-algebra-for-ta', order: 3, stage: 'geometry' } }),
        first,
      ]),
    /contradict learning order/,
  );
  assert.throws(() => validateKnowledge([second]), /Unavailable prerequisite/);
  assert.throws(() => validateKnowledge([post('self', { prerequisites: ['self'] })]), /Unavailable prerequisite/);
  assert.throws(
    () => validateKnowledge([post('a', { prerequisites: ['b'] }), post('b', { prerequisites: ['a'] })]),
    /Cyclic prerequisite/,
  );
});

test('reading metadata counts actual embeds, supports overrides and has a minimum', () => {
  const demo = { ...first, body: ':::article-lab{id="dot"}\n:::article-lab{id="cross"}' };
  assert.equal(getArticleReadingInfo(demo).demos, 2);
  assert.equal(getArticleReadingInfo({ ...first, body: '[交互：方向](/labs/dot-projection)' }).demos, 1);
  assert.equal(getArticleReadingInfo(demo).interactive, true);
  assert.equal(getArticleReadingInfo(first).minutes, 1);
  assert.equal(getArticleReadingInfo(post('override', { readingMinutes: 12, interactive: false })).minutes, 12);
  assert.equal(
    getArticleReadingInfo({ ...first, body: '<iframe class="article-lab-frame" src="/img/posts/test/lab.html"></iframe>' })
      .demos,
    1,
  );
});
