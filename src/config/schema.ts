import { z } from 'zod';
import { ALL_HOTEL_CODES } from '../hotels/registry.js';
import { CHILD_AGE_KEYS, CO_SLEEP_FORBIDDEN_AGES, type ChildAgeKey } from '../types.js';

const HotelCodeSchema = z.enum(ALL_HOTEL_CODES);

const ChildGuestSchema = z
  .object({
    age: z.enum(CHILD_AGE_KEYS),
    sleeping: z.enum(['co_sleep', 'with_bed']),
  })
  .refine(
    (c) => !(c.sleeping === 'co_sleep' && CO_SLEEP_FORBIDDEN_AGES.has(c.age as ChildAgeKey)),
    {
      message:
        '12才(中学生) / 13才〜18才(高校生) では添い寝(co_sleep)は不可。with_bed を指定してください',
    },
  );

const SearchSchema = z.object({
  adults: z.number().int().min(1).max(15),
  children: z.array(ChildGuestSchema).max(15).default([]),
  rooms: z.number().int().min(1).max(3),
  nights: z.number().int().min(1).max(5),
});

const WaitingRoomSchema = z.object({
  enabled: z.boolean().default(true),
  max_wait_minutes: z.number().int().min(1).max(180).default(30),
});

const FetchSchema = z.object({
  concurrency: z.number().int().min(1).max(5).default(1),
  waiting_room: WaitingRoomSchema.default({ enabled: true, max_wait_minutes: 30 }),
  hotels: z.array(HotelCodeSchema).min(1).default([...ALL_HOTEL_CODES]),
});

const SmtpProviderSchema = z.enum(['gmail', 'yahoo', 'outlook', 'icloud', 'other']);

const SmtpSchema = z
  .object({
    provider: SmtpProviderSchema,
    from: z.string().email(),
    to: z.array(z.string().email()).min(1),
    subject_template: z.string().min(1).default('TDRホテル空き状況 {{date}} {{time}}'),
    host: z.string().optional(),
    port: z.number().int().positive().max(65535).optional(),
    secure: z.boolean().optional(),
  })
  .refine(
    (s) => s.provider !== 'other' || (s.host !== undefined && s.port !== undefined && s.secure !== undefined),
    {
      message: 'provider: other を選んだ場合は host / port / secure を必ず指定してください',
    },
  );

const ReportSchema = z.object({
  save_to_file: z.boolean().default(true),
  output_dir: z.string().default('./reports'),
});

const BehaviorSchema = z.object({
  notify_on_total_failure: z.boolean().default(false),
});

export const ConfigSchema = z.object({
  search: SearchSchema,
  fetch: FetchSchema.default({
    concurrency: 1,
    waiting_room: { enabled: true, max_wait_minutes: 30 },
    hotels: [...ALL_HOTEL_CODES],
  }),
  smtp: SmtpSchema,
  report: ReportSchema.default({ save_to_file: true, output_dir: './reports' }),
  behavior: BehaviorSchema.default({ notify_on_total_failure: false }),
});

export type Config = z.infer<typeof ConfigSchema>;
