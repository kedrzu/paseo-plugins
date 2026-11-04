import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';

const NullableOrganizationSchema = z.string().nullable();

/**
 * What the panel shows. `state: "unavailable"` carries a human-readable `reason`, for instance
 * another platform.
 */
export const accountsStatusRpc = defineRpc({
    name: 'accounts.status',
    input: z.object({}),
    output: z.object({
        state: z.enum(['ready', 'unavailable']),
        reason: z.string().optional(),
        current: z
            .object({
                email: z.string(),
                organization: NullableOrganizationSchema,
                saved: z.boolean(),
            })
            .nullable(),
        accounts: z.array(
            z.object({
                email: z.string(),
                organization: NullableOrganizationSchema,
                active: z.boolean(),
                damaged: z.boolean(),
            }),
        ),
        runningClaudeProcesses: z.number().int().nonnegative(),
    }),
});

/** Saves the logged-in account. `warning` is set when the token owner could not be confirmed. */
export const accountsSaveRpc = defineRpc({
    name: 'accounts.save',
    input: z.object({}),
    output: z.object({
        email: z.string(),
        warning: z.string().optional(),
    }),
});

/**
 * Switches to a saved account. Without `confirmed` the server answers `confirmation-required` while
 * Claude sessions run, because a running session that refreshes its token can overwrite the switch.
 */
export const accountsSwitchRpc = defineRpc({
    name: 'accounts.switch',
    input: z.object({
        email: z.string(),
        confirmed: z.boolean(),
    }),
    output: z.discriminatedUnion('status', [
        z.object({
            status: z.literal('switched'),
            email: z.string(),
            warning: z.string().optional(),
        }),
        z.object({ status: z.literal('already-active') }),
        z.object({
            status: z.literal('confirmation-required'),
            runningClaudeProcesses: z.number().int().nonnegative(),
        }),
    ]),
});
