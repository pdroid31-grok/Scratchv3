"use client";

import { useEffect, useState } from "react";

const CLOSET_COLS_KEY = "pepe-closet-cols";
const CLOSET_COLS_EVENT = "pepe-closet-cols";

export type ClosetCols = 3 | 4 | 5;

export function readClosetCols(): ClosetCols {
  try {
    const raw = localStorage.getItem(CLOSET_COLS_KEY);
    if (raw === "3" || raw === "5") return Number(raw) as ClosetCols;
  } catch {
    /* private mode */
  }
  return 4;
}

export function writeClosetCols(cols: ClosetCols): void {
  try {
    localStorage.setItem(CLOSET_COLS_KEY, String(cols));
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event(CLOSET_COLS_EVENT));
}

export function useClosetCols(): ClosetCols {
  const [cols, setCols] = useState<ClosetCols>(4);
  useEffect(() => {
    const sync = () => setCols(readClosetCols());
    sync();
    window.addEventListener(CLOSET_COLS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CLOSET_COLS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return cols;
}

export function closetGridClass(cols: ClosetCols): string {
  if (cols === 3) return "grid grid-cols-3 gap-2";
  if (cols === 5) return "grid grid-cols-5 gap-2";
  return "grid grid-cols-4 gap-2";
}
