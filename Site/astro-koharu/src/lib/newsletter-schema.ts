import { z } from 'astro/zod';

/** ISO week calculated from a local calendar date, independent of the build machine timezone. */
export function getNewsletterIssue(calendarDate: string): string {
  const thursday = new Date(`${calendarDate}T00:00:00Z`);
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const yearStart = new Date(`${year}-01-01T00:00:00Z`);
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Use a real calendar date in YYYY-MM-DD format');

export const newsletterSchema = z
  .object({
    kind: z.enum(['digest', 'long-read']),
    issue: z
      .string()
      .regex(/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/)
      .refine((issue) => issue <= getNewsletterIssue(`${issue.slice(0, 4)}-12-28`), 'Invalid ISO week for this year'),
    periodStart: calendarDate,
    periodEnd: calendarDate,
  })
  .refine((value) => value.periodStart <= value.periodEnd, 'periodStart must not be after periodEnd');

export type Newsletter = z.infer<typeof newsletterSchema>;
