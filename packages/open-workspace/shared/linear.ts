import { defineRpc, defineSettings } from '@getpaseo/plugin';
import { z } from 'zod';

/**
 * The Linear organisation the issues live in. Linear has no issue URL without it, so the plugin asks
 * for it once instead of calling the Linear API.
 */
export const linearSettings = defineSettings({
    id: 'linear',
    scope: 'host',
    version: 1,
    schema: z
        .object({
            /** The `<slug>` in `https://linear.app/<slug>/…`; empty until set. */
            workspace: z
                .string()
                .regex(/^[a-z0-9-]*$/, 'Use the slug from the Linear URL: lowercase letters, digits and dashes.')
                .default(''),
        })
        .default({ workspace: '' }),
});

/**
 * The Linear issue of the workspace, from its branch or its name. The client opens it, so it lands in
 * the browser of the device the user is on.
 */
export const linearIssueUrlRpc = defineRpc({
    name: 'linear.issue-url',
    input: z.object({
        directory: z.string(),
        /** The workspace's name and title, which may start with `[LIN-123]`. */
        names: z.array(z.string()),
    }),
    output: z.object({ url: z.string() }),
});
