/**
 * The upstream identity providers this app offers for sign-in.
 *
 * Source of truth for BOTH the server (`server.ts`) and the client
 * (`client.ts` / sign-in buttons). Kept in its own dependency-free module so
 * the client can import it without pulling the server-only Better Auth
 * instance (and `pg`) into the browser bundle.
 *
 * Native Google uses Better Auth `socialProviders.google` (providerId
 * `"google"`). Email/password stays enabled separately.
 */
export type GrokProvider = {
  /** This app's local provider id; also the callback path segment. */
  providerId: string;
  /** Better Auth social id. */
  idp: string;
  /** Human label for the sign-in button. */
  label: string;
};

export const GROK_PROVIDERS: readonly GrokProvider[] = [
  { providerId: "google", idp: "google", label: "Google" },
];
