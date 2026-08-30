import { z } from 'zod';

import { REGISTER } from '@/content';

/** Validated shape of a "Register interest" submission (anti-spam fields excluded). */
export const leadSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name.').max(120),
  email: z
    .string()
    .trim()
    .min(1, 'Please enter your work email.')
    .email('That does not look like a valid email address.')
    .max(200),
  business: z.string().trim().min(1, 'Please enter your business name.').max(160),
  role: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => v || REGISTER.roles[0]),
  interests: z.array(z.string().trim().max(80)).max(12).optional().default([]),
  message: z.string().trim().max(4000).optional().default(''),
});

export type Lead = z.infer<typeof leadSchema>;

/** Full client payload, including the anti-spam fields the route checks and drops. */
export const submissionSchema = leadSchema.extend({
  /** Honeypot — must be empty. Bots fill it. */
  company_url: z.string().optional().default(''),
  /** ms between form mount and submit. Bots submit near-instantly. */
  elapsedMs: z.coerce.number().int().nonnegative().optional().default(0),
});

export type Submission = z.infer<typeof submissionSchema>;
