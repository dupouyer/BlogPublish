import { z } from 'astro/zod';
import { collectionById, seriesById } from './knowledge-config';

export const articleSeriesSchema = z
  .object({
    id: z.string().refine((id) => seriesById.has(id), 'Unknown learning series'),
    order: z.number().int().positive(),
    stage: z.string(),
  })
  .superRefine((value, ctx) => {
    if (!seriesById.get(value.id)?.stages.some((stage) => stage.id === value.stage)) {
      ctx.addIssue({ code: 'custom', path: ['stage'], message: 'Unknown series stage' });
    }
  });
export const articleCollectionsSchema = z
  .array(z.string().refine((id) => collectionById.has(id), 'Unknown topic collection'))
  .refine((ids) => new Set(ids).size === ids.length, 'Duplicate collection');

export interface ArticleSeries {
  id: string;
  order: number;
  stage: string;
}
