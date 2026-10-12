import type { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';
import { type LabId, labs } from '../article-lab/registry';

/** A standalone [交互：title](/labs/id) paragraph becomes a lazy lab with permanent fallback. */
export function rehypeArticleLab() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'p' || node.children.length !== 1) return;
      const link = node.children[0];
      if (link.type !== 'element' || link.tagName !== 'a') return;
      const href = String(link.properties?.href ?? '');
      const id = href.replace(/^\/labs\//, '') as LabId;
      if (!href.startsWith('/labs/') || !Object.hasOwn(labs, id)) return;
      const lab = labs[id];
      node.tagName = 'section';
      node.properties = { className: ['article-lab'], ariaLabel: lab.title };
      node.children = [
        {
          type: 'element',
          tagName: 'iframe',
          properties: {
            src: href,
            title: lab.title,
            loading: 'lazy',
            className: ['article-lab-frame'],
            style: 'width:100%;height:860px;border:1px solid #64748b;border-radius:16px;',
          },
          children: [],
        },
        { type: 'element', tagName: 'p', properties: {}, children: [{ type: 'text', value: `静态说明：${lab.note}` }] },
        {
          type: 'element',
          tagName: 'a',
          properties: { href, target: '_blank', rel: 'noopener' },
          children: [{ type: 'text', value: `独立打开：${lab.title}` }],
        },
      ];
    });
  };
}
