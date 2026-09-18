import { applyAction, shouldEnterHalftime, type GameAction, type GameKind, type GameState } from "../engine";
import { hasHalftimeBoxes, sealedHalftime } from "../halftime";
import { actNight, hostNight, joinNight, leaveNight, syncNight, watchNight, type RoomView, type WatchView } from "../rooms";
import {
  type ClientState,
  type StoreGet,
  type StoreSet,
  commitLocal,
  initialState,
  lockJoinPrefill,
  pairAvatars,
  pairReady,
  pairUserIds,
  persistLocal,
  persistNet,
  profileSeat,
  snapshot,
} from "./persist";

export function applyRemote(state: ClientState, view: RoomView): ClientState {
  const remote = view.state;
  const halftime =
    remote.phase === "halftime"
      ? hasHalftimeBoxes(remote.halftime)
        ? remote.halftime
        : sealedHalftime()
      : (remote.halftime ?? null);
  return {
    ...state,
    ...remote,
    discards: remote.discards ?? [],
    rerollFx: remote.rerollFx ?? null,
    bonus: remote.bonus ?? [0, 0],
    freeRerolls: remote.freeRerolls ?? [0, 0],
    series: remote.series ?? [0, 0],
    nights: remote.nights ?? 0,
    loans: remote.loans ?? [],
    avatars: pairAvatars(remote.avatars),
    userIds: pairUserIds(remote.userIds),
    rematchReady: pairReady(remote.rematchReady),
    shuffleUsed: pairReady(remote.shuffleUsed),
    rerollUsed: pairReady(remote.rerollUsed),
    chat: Array.isArray(remote.chat) ? remote.chat : [],
    kind: remote.kind === "elimination" ? "elimination" : "auction",
    elim: remote.elim ?? null,
    daily: remote.daily ?? null,
    weekly: remote.weekly ?? null,
    halftime,
    mode: "online",
    roomCode: view.code,
    token: view.token,
    mySeat: view.seat,
    version: view.version,
    netError: null,
    busy: false,
    acting: false,
    hydrated: true,
    lobbyStay: state.lobbyStay,
    roomFilled: Boolean(view.filled) || Boolean(remote.names?.[1]?.trim()),
  };
}

export function applyWatch(state: ClientState, view: WatchView): ClientState {
  const next = applyRemote(state, {
    ok: true,
    code: view.code,
    seat: 0,
    token: "",
    version: view.version,
    state: view.state,
    filled: view.filled,
  });
  return { ...next, mode: "watch", token: null, mySeat: null, acting: false, busy: false };
}

export async function hostOnline(get: StoreGet, set: StoreSet, name: string, kind: GameKind = "auction", fromLobby = false) {
  set({ busy: true, netError: null });
  try {
    const seat = await profileSeat(name);
    const view = await hostNight({ data: { name: seat.name, avatarId: seat.avatarId, kind, publicJoin: fromLobby } });
    const next = { ...applyRemote(get(), view), lobbyStay: fromLobby };
    persistNet(next);
    persistLocal(next);
    lockJoinPrefill();
    set(next);
  } catch {
    set({ busy: false, netError: "Could not open a night. Try again." });
  }
}

export async function joinOnline(get: StoreGet, set: StoreSet, code: string, name: string) {
  set({ busy: true, netError: null });
  try {
    const seat = await profileSeat(name);
    const result = await joinNight({ data: { code, name: seat.name, avatarId: seat.avatarId } });
    if (!result.ok) {
      set({ busy: false, netError: result.error });
      return;
    }
    const next = applyRemote(get(), result);
    persistNet(next);
    persistLocal(next);
    lockJoinPrefill();
    set(next);
  } catch {
    set({ busy: false, netError: "Could not join that night." });
  }
}

export async function watchOnline(get: StoreGet, set: StoreSet, code: string) {
  set({ busy: true, netError: null });
  try {
    const result = await watchNight({ data: { code, claim: true } });
    if (!result.ok) {
      set({ busy: false, netError: result.error });
      return;
    }
    set(applyWatch(get(), result));
    void import("../profile-store").then(({ useProfile }) => useProfile.getState().load());
  } catch {
    set({ busy: false, netError: "Could not view that night." });
  }
}

export async function pullRemote(get: StoreGet, set: StoreSet) {
  const state = get();
  if (state.mode === "watch" && state.roomCode) {
    try {
      const result = await watchNight({ data: { code: state.roomCode } });
      const latest = get();
      if (latest.mode !== "watch" || latest.roomCode !== state.roomCode) return;
      if (!result.ok) {
        set({ ...initialState, hydrated: true, netError: result.error });
        return;
      }
      if (result.version === latest.version && syncKey(result.state) === syncKey(latest)) {
        if (latest.busy) set({ busy: false });
        return;
      }
      set(applyWatch(latest, result));
    } catch {
      /* next poll retries */
    }
    return;
  }
  if (state.mode !== "online" || !state.roomCode || !state.token) return;
  try {
    const result = await syncNight({ data: { code: state.roomCode, token: state.token } });
    const latest = get();
    if (latest.mode !== "online" || latest.roomCode !== state.roomCode || !latest.token) return;
    if (!result.ok) {
      if (latest.acting) return;
      const cleared: ClientState = { ...initialState, hydrated: true, netError: result.error };
      persistNet(cleared);
      persistLocal(cleared);
      set(cleared);
      return;
    }
    if (result.version < latest.version) {
      const serverGuest = Boolean(result.filled) || Boolean(result.state.names?.[1]?.trim());
      if (latest.roomFilled || latest.names[1]?.trim() || !serverGuest) return;
    }
    if (latest.acting && result.version === latest.version && phaseRank(result.state.phase) <= phaseRank(latest.phase)) {
      return;
    }
    const sameVersion = result.version === latest.version;
    const sameKey = syncKey(result.state) === syncKey(latest);
    const sameGuest =
      Boolean(result.filled || result.state.names?.[1]?.trim()) ===
      Boolean(latest.roomFilled || latest.names[1]?.trim());
    if (sameVersion && sameKey && sameGuest) {
      if (latest.busy && !latest.acting) set({ busy: false });
      return;
    }
    const next = applyRemote(latest, result);
    persistNet(next);
    set(next);
  } catch {
    /* keep last known state; next poll retries */
  }
}

export function rematchNight(get: StoreGet, set: StoreSet) {
  get().mode === "online"
    ? void sendAction(get, set, { type: "rematch" })
    : commitLocal(get, set, { type: "rematch" });
}

export function cancelRematch(get: StoreGet, set: StoreSet) {
  get().mode === "online"
    ? void sendAction(get, set, { type: "cancelRematch" })
    : commitLocal(get, set, { type: "cancelRematch" });
}

export function sendChat(get: StoreGet, set: StoreSet, text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return;
  if (get().mode === "online") void sendAction(get, set, { type: "chat", text: clean });
  else commitLocal(get, set, { type: "chat", text: clean });
}

export async function sendAction(get: StoreGet, set: StoreSet, action: GameAction) {
  const state = get();
  if (state.mode === "watch" || !state.roomCode || !state.token) return;
  const silent =
    action.type === "flushElimDraft" || action.type === "finishElim" || action.type === "chat";
  if (state.acting && !silent) return;
  const free =
    action.type === "advance" ||
    action.type === "rematch" ||
    action.type === "cancelRematch" ||
    action.type === "pickBox" ||
    action.type === "startReveal" ||
    action.type === "finishElim" ||
    action.type === "flushElimDraft" ||
    action.type === "timeoutElim" ||
    action.type === "chat" ||
    action.type === "setElimEra" ||
    action.type === "readyElim";
  if (!free && state.mySeat !== state.currentBidder) return;
  const enteringHalftime = action.type === "advance" && shouldEnterHalftime(state);
  const waitForServer =
    action.type === "reroll" ||
    action.type === "shuffleLot" ||
    action.type === "timeoutElim" ||
    enteringHalftime;
  if (enteringHalftime) {
    set({
      ...state,
      phase: "halftime",
      currentBidder: 0,
      halftime: state.halftime ?? sealedHalftime(),
      acting: true,
      busy: true,
    });
  } else if (waitForServer) {
    set({ acting: true, busy: true });
  } else if (silent) {
    const prev = snapshot(state);
    const optimistic = applyAction(prev, action, state.mySeat ?? undefined);
    set({
      ...optimistic,
      acting: false,
      busy: false,
    });
  } else {
    const prev = snapshot(state);
    const optimistic = applyAction(prev, action, state.mySeat ?? undefined);
    set({
      ...optimistic,
      acting: true,
      busy: true,
    });
  }
  let timeoutId: number | undefined;
  if (typeof window !== "undefined") {
    timeoutId = window.setTimeout(() => {
      const latest = get();
      if (!latest.acting) return;
      set({ acting: false, busy: false });
      void latest.pullRemote();
    }, 4000);
  }
  try {
    const result = await actNight({
      data: { code: state.roomCode, token: state.token, version: state.version, action },
    });
    const latest = get();
    if (latest.mode !== "online" || !latest.roomCode) return;
    if (!result.ok) {
      const cleared: ClientState = { ...initialState, hydrated: true, netError: result.error };
      persistNet(cleared);
      persistLocal(cleared);
      set(cleared);
      return;
    }
    if (result.version < latest.version) return;
    const next = applyRemote(latest, result);
    persistNet(next);
    set(next);
  } catch {
    set({ busy: false, acting: false });
    void get().pullRemote();
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

export function resetGame(get: StoreGet, set: StoreSet) {
  const state = get();
  const next: ClientState = { ...initialState, hydrated: true };
  persistLocal(next);
  persistNet(next);
  lockJoinPrefill();
  set(next);
  if (state.mode === "online" && state.roomCode && state.token) {
    void leaveNight({ data: { code: state.roomCode, token: state.token } }).catch(() => {
      /* already left */
    });
  }
}

function phaseRank(phase: GameState["phase"]): number {
  switch (phase) {
    case "setup":
      return 0;
    case "lobby":
      return 1;
    case "bidding":
    case "unopposed":
      return 2;
    case "sold":
      return 3;
    case "draft":
      return 2;
    case "matchup":
      return 3;
    case "reveal":
      return 4;
    case "halftime":
      return 4;
    case "results":
      return 5;
    default:
      return 0;
  }
}

function syncKey(state: GameState): string {
  const lot = state.lots[state.lotIndex];
  return [
    state.phase,
    state.lotIndex,
    state.currentBid,
    state.currentBidder,
    state.bidHolder ?? "x",
    state.lotRerolled ? "1" : "0",
    state.rerollUsed?.[0] ? "1" : "0",
    state.rerollUsed?.[1] ? "1" : "0",
    state.discards.length,
    state.history.length,
    state.choice ?? "x",
    lot?.player.id ?? "",
    lot?.other.id ?? "",
    state.rerollFx?.seq ?? 0,
    state.cash[0],
    state.cash[1],
    state.sales.length,
    state.bonus?.[0] ?? 0,
    state.bonus?.[1] ?? 0,
    state.freeRerolls?.[0] ?? 0,
    state.freeRerolls?.[1] ?? 0,
    state.series?.[0] ?? 0,
    state.series?.[1] ?? 0,
    state.nights ?? 0,
    state.kind ?? "auction",
    state.elim?.round ?? "x",
    state.elim?.taken?.length ?? 0,
    state.elim?.picks[0]?.length ?? 0,
    state.elim?.picks[1]?.length ?? 0,
    state.elim?.revealAt ?? "x",
    state.elim?.week ?? "x",
    state.elim?.weekWins?.join(":") ?? "",
    state.elim?.lastSet?.week ?? "x",
    state.elim?.weekReady?.join(":") ?? "",
    state.elim?.firstPicker ?? "x",
    state.elim?.order?.join("") ?? "",
    state.elim?.lastPickId ?? "x",
    state.elim?.pickHoldUntil ?? "x",
    state.elim?.pending?.round ?? "x",
    state.elim?.pickClockUntil ?? "x",
    state.chat?.length ?? 0,
    state.chat?.at(-1)?.at ?? 0,
    state.halftime?.picks[0] ?? "x",
    state.halftime?.picks[1] ?? "x",
    state.halftime?.applied ? "1" : "0",
    state.halftime?.ready?.join(":") ?? "0:0",
    state.halftime?.boxes?.flat().map((p) => `${p.kind}:${p.amount}`).join("") ?? "",
  ].join("|");
}
