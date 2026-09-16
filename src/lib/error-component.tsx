"use client";

import { useEffect } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";

const RELOAD_KEY = "darkness-chunk-reload";
const MAX_RELOADS = 6;

function isStaleChunk(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? error ?? "");
  return /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|loading chunk .+ failed|load failed/i.test(
    message,
  );
}

function reloadCount(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  } catch {
    return MAX_RELOADS;
  }
}

function bumpReload(): number {
  const next = reloadCount() + 1;
  try {
    sessionStorage.setItem(RELOAD_KEY, String(next));
  } catch {
    /* ignore */
  }
  return next;
}

function freshHome() {
  window.location.replace(`${window.location.origin}/?_r=${Date.now()}`);
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const stale = isStaleChunk(error);
  const stuck = stale && reloadCount() >= MAX_RELOADS;
  const message = stale
    ? stuck
      ? "The latest app didn’t finish loading. Tap Reload."
      : "The app updated. Reloading a fresh copy…"
    : String((error as { message?: string })?.message || "An unexpected error occurred. Try reloading the page.");

  useEffect(() => {
    if (!stale || stuck) return;
    const n = bumpReload();
    const id = window.setTimeout(freshHome, 600 * n);
    return () => window.clearTimeout(id);
  }, [stale, stuck]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        background: "#0b0d0c",
        color: "#e7e7ea",
        fontFamily: "Barlow, system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 28, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        Darkness
      </h1>
      <p style={{ margin: 0, maxWidth: 420, fontSize: 14, color: "#a0a0ab" }}>{message}</p>
      <button
        type="button"
        style={{
          marginTop: 8,
          height: 44,
          padding: "0 16px",
          border: 0,
          borderRadius: 8,
          background: "#dce6d4",
          color: "#0b0d0c",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
        onClick={() => {
          try {
            sessionStorage.removeItem(RELOAD_KEY);
          } catch {
            /* ignore */
          }
          freshHome();
        }}
      >
        Reload
      </button>
    </div>
  );
}
