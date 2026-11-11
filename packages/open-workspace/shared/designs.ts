import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';

/** The `.pen` files under a workspace directory, as sorted paths relative to it with `/` separators. */
export const designsListRpc = defineRpc({
    name: 'designs.list',
    input: z.object({ directory: z.string() }),
    output: z.object({ files: z.array(z.string()) }),
});

/** Opens one of the files `designs.list` returns in the Pen app on the daemon host. */
export const designsOpenRpc = defineRpc({
    name: 'designs.open',
    input: z.object({ directory: z.string(), path: z.string() }),
    output: z.object({}),
});
