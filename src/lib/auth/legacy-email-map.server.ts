/**
 * First Google/email sign-in for addresses in env LEGACY_EMAIL_MAP
 * (JSON object, keys lowercased) must use the mapped Better Auth user.id.
 *
 * Do not put mapped emails in the repo. Set LEGACY_EMAIL_MAP on the host.
 * Board/profile dumps live in `@/lib/game/legacy-seed.server` (LEGACY_SEEDS).
 */
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { getSql } from "../db";
import { legacySeedFor, seedLegacyPlayer } from "../game/legacy-seed.server";
import { isHiddenBoardId } from "../game/stats-shared";

export { seedLegacyPlayer } from "../game/legacy-seed.server";

type AuthUserRow = { id: string; email: string; name: string };

function envJson(key: string): unknown {
  const raw = process.env[key]?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    console.error(`[legacy-email-map] ${key} is not valid JSON`);
    return null;
  }
}

export function legacyEmailMap(): Map<string, string> {
  const parsed = envJson("LEGACY_EMAIL_MAP");
  const out = new Map<string, string>();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out;
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const email = key.trim().toLowerCase();
    const id = typeof value === "string" ? value.trim() : "";
    if (email && id && !isHiddenBoardId(id)) out.set(email, id);
  }
  return out;
}

export function mappedIdForEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return legacyEmailMap().get(email.trim().toLowerCase()) ?? null;
}

async function findUserByEmail(email: string): Promise<AuthUserRow | null> {
  const sql = await getSql();
  const rows = await sql.query<AuthUserRow>(
    `select id, email, name from "user" where lower(email) = $1 limit 1`,
    [email.trim().toLowerCase()],
  );
  return rows[0] ?? null;
}

async function findUserById(id: string): Promise<AuthUserRow | null> {
  const sql = await getSql();
  const rows = await sql.query<AuthUserRow>(`select id, email, name from "user" where id = $1 limit 1`, [id]);
  return rows[0] ?? null;
}

function throwEmailBound(existingUserId: string): never {
  throw new APIError("CONFLICT", {
    message: `LEGACY_EMAIL_MAP: email already has user ${existingUserId}`,
  });
}

export async function assertLegacyEmailFree(email: string, mappedId: string): Promise<void> {
  const existing = await findUserByEmail(email);
  if (existing && existing.id !== mappedId) throwEmailBound(existing.id);
}

export async function bindLegacyEmailToMappedId(email: string, mappedId: string): Promise<AuthUserRow | null> {
  const normalized = email.trim().toLowerCase();
  await assertLegacyEmailFree(normalized, mappedId);
  const existing = await findUserById(mappedId);
  if (!existing) return null;
  const sql = await getSql();
  const name = legacySeedFor(mappedId)?.name ?? existing.name;
  await sql.query(
    `update "user"
        set email = $1,
            name = $2,
            "emailVerified" = true,
            "updatedAt" = now()
      where id = $3`,
    [normalized, name, mappedId],
  );
  return { id: mappedId, email: normalized, name };
}

export async function legacyUserCreateBefore(user: {
  id?: string;
  email?: string;
  name?: string;
}): Promise<{ data: typeof user } | false> {
  const email = String(user.email ?? "").trim().toLowerCase();
  const mapped = mappedIdForEmail(email);
  if (!mapped) return { data: user };

  await assertLegacyEmailFree(email, mapped);
  const bound = await bindLegacyEmailToMappedId(email, mapped);
  if (bound) return false;

  const seed = legacySeedFor(mapped);
  return {
    data: {
      ...user,
      id: mapped,
      email,
      name: seed?.name ?? user.name,
    },
  };
}

export function legacyEmailMapPlugin(): BetterAuthPlugin {
  return {
    id: "legacy-email-map",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/sign-up/email",
          handler: createAuthMiddleware(async (ctx) => {
            const email = String((ctx.body as { email?: string } | undefined)?.email ?? "")
              .trim()
              .toLowerCase();
            const mapped = mappedIdForEmail(email);
            if (!mapped) return;

            await assertLegacyEmailFree(email, mapped);
            const bound = await bindLegacyEmailToMappedId(email, mapped);
            if (!bound) return;

            const accounts = await ctx.context.internalAdapter.findAccounts(mapped);
            const cred = accounts.find((row) => row.providerId === "credential");
            if (cred?.password) return;

            const password = String((ctx.body as { password?: string } | undefined)?.password ?? "");
            if (!password) throw new APIError("BAD_REQUEST", { message: "Password required" });
            const hash = await ctx.context.password.hash(password);
            if (!cred) {
              await ctx.context.internalAdapter.linkAccount({
                userId: mapped,
                providerId: "credential",
                accountId: mapped,
                password: hash,
              });
            }
            await seedLegacyPlayer(mapped);
            const session = await ctx.context.internalAdapter.createSession(mapped);
            if (!session) throw new APIError("BAD_REQUEST", { message: "Failed to create session" });
            const user = await ctx.context.internalAdapter.findUserById(mapped);
            if (!user) throw new APIError("BAD_REQUEST", { message: "Failed to load mapped user" });
            await setSessionCookie(ctx, { session, user });
            return ctx.json({ token: session.token, user });
          }),
        },
      ],
    },
  };
}
