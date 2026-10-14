import readingTime from 'reading-time';
import type { BlogPost } from '@/types/blog';
import type { KnowledgeGroup } from './knowledge-config';
import { collectionById, seriesById } from './knowledge-config';

export const postKey = (post: BlogPost) => post.data.link ?? post.id;
export const postHref = (post: BlogPost) => `/post/${postKey(post).split('/').map(encodeURIComponent).join('/')}`;
export const seriesHref = (id: string) => `/series/${id}/`;
export const collectionHref = (id: string) => `/collections/${id}/`;

/** Learning order is independent of publication dates; collections stay chronological. */
export function getLearningPosts(posts: BlogPost[], id: string): BlogPost[] {
  return posts
    .filter((post) => post.data.series?.id === id)
    .sort((a, b) => (a.data.series?.order ?? 0) - (b.data.series?.order ?? 0));
}
export function getCollectionPosts(posts: BlogPost[], id: string): BlogPost[] {
  return posts
    .filter((post) => post.data.collection?.includes(id))
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}
export function getArticleReadingInfo(post: BlogPost) {
  const body = post.body ?? '';
  const demos =
    (body.match(/^\[交互：[^\n]*\]\(\/labs\/[^)]+\)\s*$/gm)?.length ?? 0) +
    (body.match(/<iframe\b[^>]*src=["']\/img\/posts\/[^"']+\/lab\.html["']/g)?.length ?? 0) +
    (body.match(/:::article-lab\{|<InteractiveDemo\b/g)?.length ?? 0);
  return {
    minutes: post.data.readingMinutes ?? Math.max(1, Math.ceil(readingTime(post.body ?? '').minutes)),
    interactive: post.data.interactive ?? demos > 0,
    demos,
    difficulty: post.data.difficulty ?? '进阶',
  };
}
export function getFoundations(group: KnowledgeGroup, posts: BlogPost[]) {
  return (group.foundations ?? []).flatMap((key) => {
    const post = posts.find((item) => postKey(item) === key);
    return post ? [post] : [];
  });
}

/** Fail the build before shipping duplicate order, broken prerequisites or cyclic paths. */
export function validateKnowledge(posts: BlogPost[]) {
  const byKey = new Map(posts.map((post) => [postKey(post), post]));
  const orders = new Set<string>();
  for (const post of posts) {
    const key = postKey(post);
    if (post.data.series) {
      const series = post.data.series;
      const orderKey = `${series.id}:${series.order}`;
      if (!seriesById.has(series.id) || orders.has(orderKey)) throw new Error(`Invalid or duplicate series order: ${key}`);
      orders.add(orderKey);
    }
    for (const id of post.data.collection ?? []) {
      if (!collectionById.has(id)) throw new Error(`Unknown collection ${id}: ${key}`);
    }
    for (const dependency of post.data.prerequisites ?? []) {
      if (!byKey.has(dependency) || dependency === key) throw new Error(`Unavailable prerequisite ${dependency}: ${key}`);
    }
  }
  for (const [id, group] of seriesById) {
    const ordered = getLearningPosts(posts, id);
    let previousStage = -1;
    for (const post of ordered) {
      const stage = group.stages.findIndex((item) => item.id === post.data.series?.stage);
      if (stage < previousStage || stage < 0) throw new Error(`Series stages contradict learning order: ${postKey(post)}`);
      previousStage = stage;
    }
  }
  const completed = new Set<string>();
  const visit = (key: string, path: Set<string>) => {
    if (path.has(key)) throw new Error(`Cyclic prerequisite: ${key}`);
    if (completed.has(key)) return;
    const nextPath = new Set([...path, key]);
    for (const dependency of byKey.get(key)?.data.prerequisites ?? []) visit(dependency, nextPath);
    completed.add(key);
  };
  for (const key of byKey.keys()) visit(key, new Set());
}
