import type { BlogPost } from 'types/blog';

export const newsletterLabels = { digest: '每周精选', 'long-read': '深度阅读' } as const;

/** Only standardized editions enter the news archive; legacy weekly posts keep their URLs. */
export function getNewsletterPosts(posts: BlogPost[]): BlogPost[] {
  const editions = posts.filter((post) => post.data.newsletter && post.data.draft !== true);
  const seen = new Set<string>();
  for (const post of editions) {
    const edition = post.data.newsletter;
    if (!edition) continue;
    const key = `${edition.issue}:${edition.kind}`;
    if (seen.has(key)) throw new Error(`Duplicate newsletter edition: ${key}`);
    seen.add(key);
  }
  return editions.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export function groupNewsletterPosts(posts: BlogPost[]): { issue: string; posts: BlogPost[] }[] {
  const groups = new Map<string, BlogPost[]>();
  for (const post of getNewsletterPosts(posts)) {
    const issue = post.data.newsletter?.issue;
    if (!issue) continue;
    const group = groups.get(issue) ?? [];
    group.push(post);
    groups.set(issue, group);
  }
  return [...groups].sort(([a], [b]) => b.localeCompare(a)).map(([issue, posts]) => ({ issue, posts }));
}
