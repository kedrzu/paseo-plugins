import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';

/** The longest a single extension may add; a typo should not keep the Mac up for days. */
export const MAX_EXTEND_MINUTES = 24 * 60;

const statusOutput = z.object({
    /** When the Mac may sleep again, in epoch milliseconds; `null` when nothing keeps it awake. */
    endsAt: z.number().nullable(),
});

/** Whether the plugin keeps the daemon host awake, and until when. */
export const keepAwakeStatusRpc = defineRpc({
    name: 'keep-awake.status',
    input: z.object({}),
    output: statusOutput,
});

/** Adds `minutes` to the running session, or starts one that ends `minutes` from now. */
export const keepAwakeExtendRpc = defineRpc({
    name: 'keep-awake.extend',
    input: z.object({ minutes: z.number().int().positive().max(MAX_EXTEND_MINUTES) }),
    output: statusOutput,
});

/** Ends the session, so the Mac sleeps on its normal timers again. */
export const keepAwakeStopRpc = defineRpc({
    name: 'keep-awake.stop',
    input: z.object({}),
    output: statusOutput,
});
