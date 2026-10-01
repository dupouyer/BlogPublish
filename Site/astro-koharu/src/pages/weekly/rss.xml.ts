import rss from '@astrojs/rss';
import { getSortedPosts } from '@lib/content';
import { getNewsletterPosts, newsletterLabels } from '@lib/newsletter';
import { encodeSlug } from '@lib/route';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  if (!context.site) throw new Error('Missing site metadata');
  const posts = getNewsletterPosts(await getSortedPosts());
  const response = await rss({
    title: 'TA / 实时渲染技术周报',
    description: '每周精选与深度阅读：实时渲染、UE、GPU、技术美术与 AI 工具链。',
    site: context.site,
    trailingSlash: false,
    stylesheet: '/rss/feed.xsl',
    items: posts.slice(0, 50).map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.description,
      link: `/post/${encodeSlug(post.data.link ?? post.id)}`,
      categories: post.data.newsletter ? [newsletterLabels[post.data.newsletter.kind]] : [],
    })),
  });
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/xml; charset=utf-8');
  return new Response(response.body, { status: response.status, headers });
}
