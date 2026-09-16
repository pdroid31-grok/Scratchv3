"use client";

import { useEffect } from "react";

const KEY = "darkness-css-reload";

function tailwindMissing(): boolean {
  const probe = document.createElement("div");
  probe.className = "rounded-xl";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const radius = getComputedStyle(probe).borderRadius;
  probe.remove();
  return !radius || radius === "0px";
}

function injectAppCss() {
  if ([...document.querySelectorAll("link[rel=stylesheet]")].some((node) =>
    String((node as HTMLLinkElement).href).includes("/app.css"),
  )) {
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `/app.css?t=${Date.now()}`;
  document.head.appendChild(link);
}

export function StyleGuard() {
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!tailwindMissing()) {
        try {
          sessionStorage.removeItem(KEY);
        } catch {
          /* ignore */
        }
        return;
      }
      injectAppCss();
      window.setTimeout(() => {
        if (!tailwindMissing()) {
          try {
            sessionStorage.removeItem(KEY);
          } catch {
            /* ignore */
          }
          return;
        }
        let n = 0;
        try {
          n = Number(sessionStorage.getItem(KEY) || 0);
        } catch {
          n = 3;
        }
        if (n >= 2) return;
        try {
          sessionStorage.setItem(KEY, String(n + 1));
        } catch {
          /* ignore */
        }
        window.location.replace(`${window.location.origin}/?_r=${Date.now()}`);
      }, 500);
    }, 200);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}
