import { readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { grokPwaPlugin } from "./scripts/grok-pwa-plugin.mjs";
// @ts-expect-error JS plugin alongside the TS vite config
import { appEnvPlugin } from "./scripts/app-env-plugin.mjs";
import { isMigrationFile } from "./scripts/migration-plan.mjs";

/** The files `src/lib/db.ts` globs — same directory, same non-recursive scope. */
function hasGlobbedMigrations(root: string): boolean {
  try {
    return readdirSync(join(root, "migrations")).some(isMigrationFile);
  } catch {
    return false;
  }
}

/**
 * PGLite / node-postgres are server-only. Client files (profile-store → stats,
 * rooms, auth middleware) dynamically import `@/lib/db`, and Vite still follows
 * that into `@electric-sql/pglite` + the 16MB wasm. Stub those ids on the
 * client graph so the phone/PWA never sees them. Leftover wasm that Nitro copies
 * into public static is deleted, then the build fails if any remains.
 */
function keepPgliteOffClientPlugin(): Plugin {
  const VIRTUAL = "\0empty-server-db";
  const STUB = [
    "export async function getSql() { throw new Error('server-only') }",
    "export async function getPglite() { throw new Error('server-only') }",
    "export function ensureDbReady() { return Promise.resolve() }",
    "export const dbSource = 'neon'",
    "export const Pool = function () {}",
    "export const types = { setTypeParser() {} }",
    "export function pgliteDialect() { return {} }",
    "export default {}",
  ].join("\n");

  const shouldStub = (source: string) => {
    const id = source.replace(/\\/g, "/").split("?")[0] ?? source;
    if (id === "@/lib/db" || id.endsWith("/src/lib/db.ts") || id.endsWith("/src/lib/db")) return true;
    if (id.endsWith("/src/lib/auth/pglite-dialect.ts") || id.endsWith("/src/lib/auth/pglite-dialect")) return true;
    if (id.includes("@electric-sql/pglite")) return true;
    if (id === "pg" || id.startsWith("pg/") || id.includes("/node_modules/pg/")) return true;
    if (id.includes("/node_modules/pg-pool/") || id.includes("/node_modules/pg-types/")) return true;
    if (id.includes("/node_modules/pg-connection-string/") || id.includes("/node_modules/pgpass/")) return true;
    if (/\b(pglite|initdb)[^/]*\.(wasm|data)$/i.test(id)) return true;
    return false;
  };

  const wipePublicWasm = (dir: string) => {
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (/\b(pglite|initdb)/i.test(name)) unlinkSync(join(dir, name));
    }
  };

  return {
    name: "app-builder:keep-pglite-off-client",
    enforce: "pre",
    resolveId(source) {
      if (this.environment?.name !== "client") return null;
      if (!shouldStub(source)) return null;
      return VIRTUAL;
    },
    load(id) {
      if (id === VIRTUAL) return STUB;
      return null;
    },
    generateBundle(_opts, bundle) {
      if (this.environment?.name !== "client") return;
      for (const key of Object.keys(bundle)) {
        if (/\b(pglite|initdb)/i.test(key) && /\.(wasm|data|js)$/i.test(key)) delete bundle[key];
      }
    },
    closeBundle: {
      sequential: true,
      order: "post",
      handler() {
        const pub = join(process.cwd(), ".vercel/output/static");
        wipePublicWasm(join(pub, "assets"));
        wipePublicWasm(join(process.cwd(), "dist/client/assets"));
        try {
          const names = readdirSync(join(pub, "assets"));
          const bad = names.filter((name) => /\b(pglite|initdb)/i.test(name));
          if (bad.length) {
            throw new Error(`[pglite] phone bundle still has ${bad.join(", ")}`);
          }
        } catch (err) {
          if (err instanceof Error && err.message.startsWith("[pglite]")) throw err;
        }
      },
    },
  };
}

/**
 * Finish PGLite bootstrap during dev-server setup (before traffic). Vite awaits
 * async `configureServer` hooks. Production: `src/lib/db` kicks `ensureDbReady`
 * on import.
 *
 * Vite awaiting the hook puts this on time-to-first-render, so an app with no
 * migrations — no schema to apply — skips it entirely rather than paying for a
 * PGLite instance it never queries.
 */
function pgliteBootstrapPlugin(): Plugin {
  return {
    name: "app-builder:pglite-bootstrap",
    apply: "serve",
    async configureServer(server) {
      if (!hasGlobbedMigrations(server.config.root)) return;
      try {
        const mod = (await server.ssrLoadModule("/src/lib/db.ts")) as {
          ensureDbReady?: () => Promise<void>;
        };
        if (typeof mod.ensureDbReady === "function") {
          await mod.ensureDbReady();
        }
      } catch (err) {
        console.error("[app-builder] DB bootstrap failed:", err);
        throw err;
      }
    },
  };
}

/**
 * Live-preview OAuth popup — handled HERE so the agent never has to create a
 * `/auth/popup` route (and cannot break it by scaffolding a React page that
 * paints the full app shell in the popup).
 *
 * `signIn` (client.ts) opens `/auth/popup?providerId=…` in a top-level window.
 * This middleware runs before TanStack Start, calls `handleAuthPopupRequest`,
 * and returns the 302 / completion HTML. Deployed apps do not use the popup
 * (full-page OAuth redirect), so `apply: "serve"` is enough.
 */
function authPopupPlugin(): Plugin {
  return {
    name: "app-builder:auth-popup",
    apply: "serve",
    configureServer(server) {
      // Register immediately (not in a returned post-hook) so we run BEFORE
      // TanStack Start / the SPA HTML fallback. A model-authored
      // `src/routes/auth/popup.tsx` React page must never win this path.
      server.middlewares.use(async (req, res, next) => {
        try {
          const rawUrl = req.url ?? "";
          const pathOnly = rawUrl.split("?", 1)[0] ?? "";
          if (pathOnly !== "/auth/popup") {
            next();
            return;
          }
          if ((req.method ?? "GET").toUpperCase() !== "GET") {
            res.statusCode = 405;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("Method Not Allowed");
            return;
          }

          const host = String(
            req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost:8080",
          );
          const proto = String(
            req.headers["x-forwarded-proto"] ??
              ((req.socket as { encrypted?: boolean } | undefined)?.encrypted ? "https" : "http"),
          );
          const requestHeaders = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value === undefined) continue;
            if (Array.isArray(value)) {
              for (const v of value) requestHeaders.append(key, v);
            } else {
              requestHeaders.set(key, value);
            }
          }
          // Ensure Host is the public preview host so Better Auth's dynamic
          // baseURL / redirect_uri match the popup origin.
          if (!requestHeaders.has("host")) requestHeaders.set("host", host);

          const request = new Request(`${proto}://${host}${rawUrl}`, {
            method: "GET",
            headers: requestHeaders,
          });

          const mod = (await server.ssrLoadModule("/src/lib/auth/popup.server.ts")) as {
            handleAuthPopupRequest: (req: Request) => Promise<Response>;
          };
          const response = await mod.handleAuthPopupRequest(request);

          res.statusCode = response.status;
          // Preserve multiple Set-Cookie headers (OAuth state + session).
          const setCookies =
            typeof response.headers.getSetCookie === "function"
              ? response.headers.getSetCookie()
              : [];
          response.headers.forEach((value, key) => {
            if (key.toLowerCase() === "set-cookie") return;
            res.setHeader(key, value);
          });
          for (const cookie of setCookies) {
            res.appendHeader("set-cookie", cookie);
          }
          const body = Buffer.from(await response.arrayBuffer());
          res.end(body);
        } catch (err) {
          console.error("[app-builder] /auth/popup handler failed:", err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("auth popup failed");
          }
        }
      });
    },
  };
}

function stableCssPlugin(): Plugin {
  return {
    name: "darkness-stable-css",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "asset" || !chunk.fileName.endsWith(".css")) continue;
        const source = chunk.source;
        if (source == null) continue;
        this.emitFile({ type: "asset", fileName: "app.css", source });
        try {
          writeFileSync(join(process.cwd(), "public", "app.css"), source);
        } catch {
          /* preview still has the last copy */
        }
      }
    },
  };
}

// `0.0.0.0:8080` is the live-preview contract — don't change host/port.
// The dev server starts once `src/router.tsx` and `src/routes/` exist — see
// AGENTS.md § "First scaffold".
export default defineConfig(({ command, isPreview }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
  optimizeDeps: {
    exclude: ["@electric-sql/pglite", "pg"],
  },
  build: {
    rollupOptions: {
      output: {
        // Keep tiny UI files inside their parents. A hashed 3kb chunk that 404s
        // on the CDN (and gets cached as 404 for a year) takes the whole app down.
        experimentalMinChunkSize: 80_000,
      },
    },
  },
  plugins: [
    pgliteBootstrapPlugin(),
    keepPgliteOffClientPlugin(),
    // Before tanstackStart so /auth/popup never falls through to the SPA.
    authPopupPlugin(),
    // Dev-only /__app-env, read by scripts/check-auth-invariant.mjs.
    appEnvPlugin(),
    // PWA head + ?install=1 tutorial page; runs before Start/Nitro.
    grokPwaPlugin(),
    tailwindcss(),
    stableCssPlugin(),
    tanstackStart(),
    ...(command === "build" || isPreview
      ? [
          nitro({
            preset: "vercel",
            // Auto-registers server/middleware/* (the PWA install page +
            // manifest + head-tag middleware). Nitro v3 defaults serverDir to
            // false, so removing this silently unwires /?install=1 on deploys.
            serverDir: "./server",
            // Vite 8.2 / Rolldown splits the SSR entry into a stub that
            // re-exports a missing `ssr_exports`, so every production request
            // 500s while `vite build` still exits 0.
            // https://github.com/TanStack/router/issues/8031
            inlineDynamicImports: true,
          }),
        ]
      : []),
    viteReact(),
  ],
}));
