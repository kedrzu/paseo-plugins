import { z } from 'zod';

const PROFILE_URL = 'https://api.anthropic.com/api/oauth/profile';
const TIMEOUT_MS = 5000;

const ProfileSchema = z.object({
    account: z.object({ email: z.email() }),
});

/** The email a token belongs to. `unconfirmed` says nothing about the token, only that nobody vouched for it. */
export type TokenOwnerResult = { state: 'confirmed'; email: string } | { state: 'unconfirmed' };

/** Asks who owns an OAuth access token. Never rejects. */
export type FetchTokenOwner = (accessToken: string) => Promise<TokenOwnerResult>;

/** Dependencies of `createFetchTokenOwner`. */
export interface CreateFetchTokenOwnerOptions {
    fetch: (url: string, init: RequestInit) => Promise<Response>;
    /** Receives at most a status code. */
    log: (message: string) => void;
}

/**
 * The profile endpoint is undocumented, so every outcome other than a well-formed email is
 * `unconfirmed` rather than an error.
 */
export function createFetchTokenOwner({ fetch, log }: CreateFetchTokenOwnerOptions): FetchTokenOwner {
    return fetchTokenOwner;

    async function fetchTokenOwner(accessToken: string): Promise<TokenOwnerResult> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
        let status: number | undefined;

        try {
            const response = await fetch(PROFILE_URL, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'anthropic-beta': 'oauth-2025-04-20',
                },
                // A redirect would send these headers to a host nobody chose.
                redirect: 'error',
                signal: controller.signal,
            });
            status = response.status;

            if (response.ok) {
                const profile = ProfileSchema.safeParse(await response.json());
                if (profile.success) {
                    return { state: 'confirmed', email: profile.data.account.email };
                }
            }
        } catch {
            // Network failure, timeout or a body that is not JSON. The error is dropped, not logged:
            // only a status code may reach the logs.
        } finally {
            clearTimeout(timeout);
        }

        log(`Token owner unconfirmed (${status === undefined ? 'no response' : `status ${status}`})`);
        return { state: 'unconfirmed' };
    }
}
