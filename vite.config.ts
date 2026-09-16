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

function authPopupPlugin(): Plugin {
  return {
    name: "app-builder:auth-popup",
    apply: "serve",
    configureServer(server) {
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
        experimentalMinChunkSize: 80_000,
      },
    },
  },
  plugins: [
    pgliteBootstrapPlugin(),
    keepPgliteOffClientPlugin(),
    authPopupPlugin(),
    appEnvPlugin(),
    grokPwaPlugin(),
    tailwindcss(),
    stableCssPlugin(),
    tanstackStart(),
    ...(command === "build" || isPreview
      ? [
          nitro({
            preset: process.env.NITRO_PRESET || "vercel",
            serverDir: "./server",
            inlineDynamicImports: true,
          }),
        ]
      : []),
    viteReact(),
  ],
}));
