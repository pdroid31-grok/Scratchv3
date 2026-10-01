import { useSyncExternalStore } from "react";
import type { RoomViewer } from "./rooms-types";

let eyes: RoomViewer[] = [];
const listeners = new Set<() => void>();

function same(left: RoomViewer[], right: RoomViewer[]): boolean {
  if (left.length !== right.length) return false;
  return left.every(
    (row, i) => row.userId === right[i]?.userId && row.name === right[i]?.name && row.avatarId === right[i]?.avatarId,
  );
}

function emit() {
  for (const listener of listeners) listener();
}

/** Room-poll faces only. Not saved with the match. */
export function noteRoomViewers(next: RoomViewer[] | undefined) {
  if (!next || same(eyes, next)) return;
  eyes = next;
  emit();
}

export function clearRoomViewers() {
  if (!eyes.length) return;
  eyes = [];
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getEyes() {
  return eyes;
}

export function useRoomViewers(): RoomViewer[] {
  return useSyncExternalStore(subscribe, getEyes, getEyes);
}
