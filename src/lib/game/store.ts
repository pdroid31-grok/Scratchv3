import { create } from "zustand";
import { applyAction, initialGame, shouldEnterHalftime, startAuction, type GameAction, type GameKind, type GameState } from "./engine";
import { elimBriefing } from "./elim";
import { dailyPickPayload, startDailyGame } from "./daily";
import { claimDaily, getDaily, lockDaily, saveDailyDraft } from "./daily-api";
import { applyWeeklyLive, startWeeklyGame, unpackWeeklyBoard, weeklyCenterGame, weeklyLockPayload } from "./weekly";
import { claimWeekly, forfeitWeekly, lockWeekly, resumeWeekly, weeklyBoardPack } from "./weekly-api";
import { hasHalftimeBoxes, sealedHalftime } from "./halftime";
import { actNight, hostNight, joinNight, leaveNight, syncNight, watchNight, type RoomView, type WatchView } from "./rooms";
import { maxBid, isEligible, canAffordReroll, canPickLot, replacementFor, shufflePair } from "./auction";
import { isAvatarId, type AvatarId } from "./avatars";
import { useProfile } from "./profile-store";
import type { LotChoice, Seat } from "./types";

const LOCAL_KEY = "darkness-v9";
const NET_KEY = "darkness-net-v1";
const JOIN_LOCK = "darkness-join-lock";

export type PlayMode = "local" | "online" | "daily" | "weekly" | "watch";

export interface ClientState extends GameState {
  hydrated: boolean;
  mode: PlayMode;
  roomCode: string | null;
  token: string | null;
  mySeat: Seat | null;
  version: number;
  netError: string | null;
  busy: boolean;
  acting: boolean;
  lobbyStay: boolean;
  roomFilled: boolean;
}

interface GameActions {
  hydrate: (prefillRoom?: string) => void;
  startGame: (name0: string, name1: string, kind?: GameKind) => void;
  startDaily: () => Promise<void>;
  startWeekly: () => Promise<void>;
  openWeeklyCenter: () => Promise<void>;
  refreshWeekly: () => Promise<void>;
  hostOnline: (name: string, kind?: GameKind, fromLobby?: boolean) => Promise<void>;
  joinOnline: (code: string, name: string) => Promise<void>;
  watchOnline: (code: string) => Promise<void>;
  placeBid: (amount: number) => void;
  selectChoice: (index: LotChoice) => void;
  pass: () => void;
  claimUnopposed: () => void;
  rerollUnopposed: () => void;
  advanceFromSold: () => void;
  pullRemote: () => Promise<void>;
  rematchNight: () => void;
  cancelRematch: () => void;
  shuffleLot: () => void;
  pickBox: (index: number, seat?: Seat) => void;
  pickElim: (id: string) => void;
  flushElimDraft: () => void;
  timeoutElim: () => void;
  startReveal: () => void;
  finishElim: () => void;
  sendChat: (text: string) => void;
  setElimEra: (era: "classic" | "modern") => void;
  readyElim: (seat?: Seat) => void;
  reset: () => void;
}

export type Store = ClientState & GameActions;

const initialState: ClientState = {
  ...initialGame(),
  hydrated: false,
  mode: "local",
  roomCode: null,
  token: null,
  mySeat: null,
  version: 0,
  netError: null,
  busy: false,
  acting: false,
  lobbyStay: false,
  roomFilled: false,
};

function lockJoinPrefill() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(JOIN_LOCK, "1");
  } catch {
    /* ignore */
  }
}

async function profileSeat(name: string): Promise<{ name: string; avatarId: AvatarId }> {
  const profile = useProfile.getState();
  if (!profile.loaded) {
    try {
      await profile.load();
    } catch {
      /* guest or stats down */
    }
  }
  const latest = useProfile.getState();
  const typed = name.trim();
  return {
    name: typed || latest.displayName,
    avatarId: latest.avatarId,
  };
}

function persistLocal(state: ClientState) {
  if (typeof window === "undefined") return;
  if (state.mode === "online" || state.mode === "watch") {
    try {
      localStorage.removeItem(LOCAL_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  if (state.phase === "setup" || state.phase === "lobby") {
    try {
      localStorage.removeItem(LOCAL_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    const {
      hydrated: _h,
      mode: _m,
      roomCode: _r,
      token: _t,
      mySeat: _s,
      version: _v,
      netError: _e,
      busy: _b,
      acting: _a,
      lobbyStay: _l,
      roomFilled: _f,
      ...rest
    } = state;
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ version: 8, mode: state.mode, ...rest }));
  } catch {
    /* ignore */
  }
}

function persistNet(state: ClientState) {
  if (typeof window === "undefined") return;
  if (state.mode !== "online" || !state.roomCode || !state.token || state.mySeat === null) {
    try {
      localStorage.removeItem(NET_KEY);
    } catch {
      /* ignore */
    }
    syncRoomSearch(null);
    return;
  }
  try {
    localStorage.setItem(
      NET_KEY,
      JSON.stringify({ code: state.roomCode, token: state.token, seat: state.mySeat }),
    );
  } catch {
    /* ignore */
  }
}

function syncRoomSearch(code: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (code) url.searchParams.set("room", code);
  else url.searchParams.delete("room");
  const next = url.pathname + url.search + url.hash;
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (next !== current) window.history.replaceState({}, "", next);
}

function pairAvatars(value: unknown): [AvatarId, AvatarId] {
  if (!Array.isArray(value) || value.length < 2) return ["poor", "poor"];
  return [
    isAvatarId(String(value[0])) ? value[0] : "poor",
    isAvatarId(String(value[1])) ? value[1] : "poor",
  ];
}

function pairUserIds(value: unknown): [string | null, string | null] {
  if (!Array.isArray(value) || value.length < 2) return [null, null];
  const a = typeof value[0] === "string" && value[0] ? value[0] : null;
  const b = typeof value[1] === "string" && value[1] ? value[1] : null;
  return [a, b];
}

function pairReady(value: unknown): [boolean, boolean] {
  if (!Array.isArray(value) || value.length < 2) return [false, false];
  return [Boolean(value[0]), Boolean(value[1])];
}

function applyRemote(state: ClientState, view: RoomView): ClientState {
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

function applyWatch(state: ClientState, view: WatchView): ClientState {
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

function snapshot(state: ClientState): GameState {
  const {
    hydrated: _h,
    mode: _m,
    roomCode: _r,
    token: _t,
    mySeat: _s,
    version: _v,
    netError: _e,
    busy: _b,
    acting: _a,
    lobbyStay: _l,
    roomFilled: _f,
    ...rest
  } = state;
  return rest;
}

function isStoredPlayer(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const player = value as { id?: unknown; name?: unknown; team?: unknown; position?: unknown; rating?: unknown };
  return (
    typeof player.id === "string" &&
    typeof player.name === "string" &&
    typeof player.team === "string" &&
    typeof player.position === "string" &&
    typeof player.rating === "number"
  );
}

function gameLooksValid(parsed: Partial<GameState>): boolean {
  if (!parsed.phase || parsed.phase === "setup" || parsed.phase === "lobby") return false;
  if (parsed.kind === "elimination") {
    return Boolean(parsed.elim && parsed.elim.year && Array.isArray(parsed.elim.picks));
  }
  if (!Array.isArray(parsed.lots) || parsed.lots.length === 0) return false;
  if (
    !parsed.lots.every((lot) => {
      if (!lot || typeof lot !== "object") return false;
      return isStoredPlayer(lot.player) && isStoredPlayer(lot.other);
    })
  ) {
    return false;
  }
  if (parsed.phase !== "results" && parsed.phase !== "halftime") {
    const index = Number(parsed.lotIndex) || 0;
    if (!parsed.lots[index]) return false;
  }
  return true;
}

export const useGame = create<Store>((set, get) => ({
  ...initialState,

  hydrate: () => {
    if (get().hydrated) return;
    try {
      try {
        localStorage.removeItem("darkness-v1");
        localStorage.removeItem("darkness-v2");
        localStorage.removeItem("darkness-v3");
        localStorage.removeItem("darkness-v4");
        localStorage.removeItem("darkness-v5");
        localStorage.removeItem("darkness-v6");
        localStorage.removeItem("darkness-v8");
      } catch {
        /* ignore */
      }
      try {
        const raw = localStorage.getItem(NET_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { code?: string; token?: string; seat?: Seat };
          if (parsed.code && parsed.token) {
            set({
              ...initialState,
              hydrated: true,
              mode: "online",
              roomCode: parsed.code,
              token: parsed.token,
              mySeat: parsed.seat ?? 0,
              busy: true,
            });
            void get().pullRemote();
            return;
          }
        }
      } catch {
        /* ignore */
      }
      try {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { version?: number; mode?: PlayMode } & Partial<GameState>;
          if (parsed.version === 8 && gameLooksValid(parsed)) {
            const mode: PlayMode = parsed.weekly ? "weekly" : parsed.daily ? "daily" : parsed.mode === "daily" || parsed.mode === "weekly" ? parsed.mode : "local";
            set({
              ...initialState,
              ...parsed,
              discards: parsed.discards ?? [],
              rerollFx: parsed.rerollFx ?? null,
              bonus: parsed.bonus ?? [0, 0],
              freeRerolls: parsed.freeRerolls ?? [0, 0],
              series: parsed.series ?? [0, 0],
              nights: parsed.nights ?? 0,
              loans: Array.isArray(parsed.loans) ? parsed.loans : [],
              avatars: pairAvatars(parsed.avatars),
              userIds: pairUserIds(parsed.userIds),
              rematchReady: pairReady(parsed.rematchReady),
              shuffleUsed: pairReady(parsed.shuffleUsed),
              rerollUsed: pairReady(parsed.rerollUsed),
              kind: parsed.kind === "elimination" ? "elimination" : "auction",
              elim: parsed.elim ?? null,
              daily: parsed.daily ?? null,
              weekly: parsed.weekly ?? null,
              halftime: parsed.halftime ?? null,
              choice: parsed.choice === 0 || parsed.choice === 1 ? parsed.choice : null,
              hydrated: true,
              mode,
            });
            if (mode === "weekly" && parsed.weekly?.locked) void get().refreshWeekly();
            if (mode === "daily") {
              void getDaily({ data: {} })
                .then((meta) => {
                  if (meta.status !== "done") return;
                  const cleared: ClientState = { ...initialState, hydrated: true };
                  persistLocal(cleared);
                  persistNet(cleared);
                  set(cleared);
                })
                .catch(() => {
                  /* keep local draft; claimDaily retries */
                });
            }
            return;
          }
        }
      } catch {
        /* ignore */
      }
      set({ ...initialState, hydrated: true });
    } catch {
      set({ ...initialState, hydrated: true });
    }
  },

  startGame: (name0, name1, kind = "auction") => {
    const dealt = kind === "elimination" ? elimBriefing(name0, name1) : startAuction(name0, name1);
    const next: ClientState = {
      ...initialState,
      ...dealt,
      hydrated: true,
      mode: "local",
    };
    persistLocal(next);
    persistNet(next);
    lockJoinPrefill();
    set(next);
  },

  startDaily: async () => {
    set({ busy: true, netError: null });
    try {
      const seat = await profileSeat("");
      const claimed = await claimDaily({ data: {} });
      if (claimed.status === "done" || claimed.status === "signed_out") {
        if (get().mode === "daily") {
          const cleared: ClientState = {
            ...initialState,
            hydrated: true,
            busy: false,
            netError: claimed.status === "signed_out" ? "Sign in to play Daily Elimination." : null,
          };
          persistLocal(cleared);
          persistNet(cleared);
          set(cleared);
          return;
        }
        set({
          busy: false,
          netError: claimed.status === "signed_out" ? "Sign in to play Daily Elimination." : null,
        });
        return;
      }
      const live = get();
      if (live.mode === "daily" && live.daily?.day === claimed.day && live.phase !== "setup") {
        set({ busy: false });
        return;
      }
      const dealt = startDailyGame(seat.name, claimed.year as import("./elim-data").ElimYear, claimed.day, seat.avatarId);
      const next: ClientState = {
        ...initialState,
        ...dealt,
        hydrated: true,
        mode: "daily",
        mySeat: 0,
        busy: false,
      };
      persistLocal(next);
      persistNet(next);
      lockJoinPrefill();
      set(next);
    } catch {
      set({ busy: false, netError: "Could not start today’s daily." });
    }
  },

  startWeekly: async () => {
    set({ busy: true, netError: null });
    try {
      const seat = await profileSeat("");
      const claimed = await claimWeekly({ data: {} });
      if (claimed.status === "done") {
        set({ busy: false });
        await get().openWeeklyCenter();
        return;
      }
      if (claimed.status === "forfeit" || claimed.status === "locked" || claimed.status === "signed_out") {
        set({
          busy: false,
          netError: claimed.status === "signed_out" ? "Sign in to play Weekly Elimination." : null,
        });
        return;
      }
      const live = get();
      if (
        live.mode === "weekly" &&
        live.weekly?.season === claimed.season &&
        live.weekly?.week === claimed.week &&
        live.phase === "draft" &&
        !live.weekly.locked &&
        claimed.status === "playing"
      ) {
        set({ busy: false });
        return;
      }
      const pack = await weeklyBoardPack({ data: {} });
      if (!pack) {
        set({ busy: false, netError: "This week’s board is locked." });
        return;
      }
      const pool = unpackWeeklyBoard(pack.board, pack.week);
      const dealt = startWeeklyGame(seat.name, pack.season, pack.week, pool, seat.avatarId);
      const next: ClientState = {
        ...initialState,
        ...dealt,
        hydrated: true,
        mode: "weekly",
        mySeat: 0,
        busy: false,
      };
      persistLocal(next);
      persistNet(next);
      lockJoinPrefill();
      set(next);
    } catch {
      set({ busy: false, netError: "Could not start this week’s board." });
    }
  },

  openWeeklyCenter: async () => {
    set({ busy: true, netError: null });
    try {
      const seat = await profileSeat("");
      const resume = await resumeWeekly({ data: {} });
      if (!resume) {
        set({ busy: false, netError: "No lineup for this week." });
        return;
      }
      const dealt = weeklyCenterGame(seat.name, resume, seat.avatarId);
      const next: ClientState = {
        ...initialState,
        ...dealt,
        hydrated: true,
        mode: "weekly",
        mySeat: 0,
        busy: false,
      };
      persistLocal(next);
      persistNet(next);
      lockJoinPrefill();
      set(next);
    } catch {
      set({ busy: false, netError: "Could not open this week’s game center." });
    }
  },

  refreshWeekly: async () => {
    const state = get();
    if (state.mode !== "weekly" || !state.weekly?.locked || !state.elim) return;
    try {
      const resume = await resumeWeekly({ data: {} });
      if (!resume) return;
      const live = get();
      if (live.mode !== "weekly" || !live.elim) return;
      const next: ClientState = { ...live, ...applyWeeklyLive(live, resume) };
      persistLocal(next);
      set(next);
    } catch {
      /* next poll retries */
    }
  },

  hostOnline: async (name, kind = "auction", fromLobby = false) => {
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
  },

  joinOnline: async (code, name) => {
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
  },

  watchOnline: async (code) => {
    set({ busy: true, netError: null });
    try {
      const result = await watchNight({ data: { code, claim: true } });
      if (!result.ok) {
        set({ busy: false, netError: result.error });
        return;
      }
      set(applyWatch(get(), result));
      void import("./profile-store").then(({ useProfile }) => useProfile.getState().load());
    } catch {
      set({ busy: false, netError: "Could not view that night." });
    }
  },

  placeBid: (amount) =>
    get().mode === "online"
      ? void sendAction(get, set, { type: "placeBid", amount })
      : commitLocal(get, set, { type: "placeBid", amount }),

  selectChoice: (index) =>
    get().mode === "online"
      ? void sendAction(get, set, { type: "selectChoice", index })
      : commitLocal(get, set, { type: "selectChoice", index }),

  pass: () =>
    get().mode === "online"
      ? void sendAction(get, set, { type: "pass" })
      : commitLocal(get, set, { type: "pass" }),

  claimUnopposed: () =>
    get().mode === "online"
      ? void sendAction(get, set, { type: "claim" })
      : commitLocal(get, set, { type: "claim" }),

  rerollUnopposed: () =>
    get().mode === "online"
      ? void sendAction(get, set, { type: "reroll" })
      : commitLocal(get, set, { type: "reroll" }),

  advanceFromSold: () =>
    get().mode === "online"
      ? void sendAction(get, set, { type: "advance" })
      : commitLocal(get, set, { type: "advance" }),

  rematchNight: () =>
    get().mode === "online"
      ? void sendAction(get, set, { type: "rematch" })
      : commitLocal(get, set, { type: "rematch" }),

  cancelRematch: () =>
    get().mode === "online"
      ? void sendAction(get, set, { type: "cancelRematch" })
      : commitLocal(get, set, { type: "cancelRematch" }),

  shuffleLot: () =>
    get().mode === "online"
      ? void sendAction(get, set, { type: "shuffleLot" })
      : commitLocal(get, set, { type: "shuffleLot" }),

  pickBox: (index, seat) => {
    if (get().mode === "online") {
      void sendAction(get, set, { type: "pickBox", index });
      return;
    }
    const state = get();
    const prev = snapshot(state);
    const nextGame = applyAction(prev, { type: "pickBox", index }, seat);
    const next: ClientState = { ...state, ...nextGame };
    persistLocal(next);
    set(next);
  },

  pickElim: (id) =>
    get().mode === "online"
      ? void sendAction(get, set, { type: "pickElim", id })
      : commitLocal(get, set, { type: "pickElim", id }),
  flushElimDraft: () => {
    if (get().mode === "online") {
      void sendAction(get, set, { type: "flushElimDraft" });
      return;
    }
    commitLocal(get, set, { type: "flushElimDraft" });
    void maybeLockDaily(get, set);
    void maybeLockWeekly(get, set);
  },
  timeoutElim: () => {
    if (get().mode === "online") {
      void sendAction(get, set, { type: "timeoutElim" });
      return;
    }
    commitLocal(get, set, { type: "timeoutElim" });
    void maybeLockDaily(get, set);
    void maybeLockWeekly(get, set);
  },

  startReveal: () =>
    get().mode === "online"
      ? void sendAction(get, set, { type: "startReveal" })
      : commitLocal(get, set, { type: "startReveal" }),

  finishElim: () =>
    get().mode === "online"
      ? void sendAction(get, set, { type: "finishElim" })
      : commitLocal(get, set, { type: "finishElim" }),
  sendChat: (text) => {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return;
    if (get().mode === "online") void sendAction(get, set, { type: "chat", text: clean });
    else commitLocal(get, set, { type: "chat", text: clean });
  },
  setElimEra: (era) => {
    if (get().mode === "online") void sendAction(get, set, { type: "setElimEra", era });
    else commitLocal(get, set, { type: "setElimEra", era }, 0);
  },
  readyElim: (seat) => {
    if (get().mode === "online") void sendAction(get, set, { type: "readyElim" });
    else commitLocal(get, set, { type: "readyElim" }, seat);
  },

  pullRemote: async () => {
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
  },

  reset: () => {
    const state = get();
    if (state.mode === "weekly" && !state.weekly?.locked) {
      void forfeitWeekly({ data: {} }).catch(() => {
        /* already closed */
      });
    }
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
  },
}));

function commitLocal(
  get: () => Store,
  set: (partial: Partial<ClientState>) => void,
  action: GameAction,
  actor?: Seat,
) {
  if (get().mode === "watch") return;
  const state = get();
  const prev = snapshot(state);
  const nextGame = applyAction(prev, action, actor);
  const next: ClientState = {
    ...state,
    ...nextGame,
  };
  persistLocal(next);
  set(next);
  if (next.mode === "daily") queueSaveDailyDraft(get);
}

async function sendAction(
  get: () => Store,
  set: (partial: Partial<ClientState> | ClientState) => void,
  action: GameAction,
) {
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

export function isOnClock(state: ClientState): boolean {
  if (state.mode !== "online") return true;
  if (state.phase === "sold" || state.phase === "results" || state.phase === "lobby") return true;
  if (state.phase === "matchup" || state.phase === "reveal") return true;
  if (state.phase === "halftime") {
    if (state.mySeat === null || !state.halftime) return false;
    if (state.halftime.applied) return true;
    return state.halftime.picks[state.mySeat] === null;
  }
  return state.mySeat === state.currentBidder;
}

export function seatMaxBid(state: GameState, seat: Seat): number {
  const lot = state.lots[state.lotIndex];
  if (!lot) return 0;
  return maxBid(state.cash[seat], state.rosters[seat], lot.slot);
}

export function seatEligible(state: GameState, seat: Seat): boolean {
  const lot = state.lots[state.lotIndex];
  if (!lot) return false;
  return isEligible(state.cash[seat], state.rosters[seat], lot.slot);
}

export function seatCanShuffle(state: GameState, seat: Seat): boolean {
  if (!canPickLot(state) || state.currentBid > 0) return false;
  if (state.currentBidder !== seat) return false;
  if (state.shuffleUsed?.[seat]) return false;
  if (!canAffordReroll(state.cash[seat], state.rosters[seat], false)) return false;
  return shufflePair(state.lots, state.lotIndex) !== null;
}

export function seatCanReroll(state: GameState, seat: Seat): boolean {
  if (state.phase !== "unopposed" || state.lotRerolled) return false;
  if (state.currentBidder !== seat) return false;
  const free = (state.freeRerolls?.[seat] ?? 0) > 0;
  if (!free && (state.rerollUsed?.[seat] ?? false)) return false;
  if (!canAffordReroll(state.cash[seat], state.rosters[seat], free)) return false;
  return replacementFor(state.lots, state.lotIndex) !== null;
}

let saveDailyTimer: number | undefined;

function queueSaveDailyDraft(get: () => Store) {
  if (typeof window === "undefined") {
    void maybeSaveDailyDraft(get);
    return;
  }
  if (saveDailyTimer !== undefined) window.clearTimeout(saveDailyTimer);
  saveDailyTimer = window.setTimeout(() => {
    saveDailyTimer = undefined;
    void maybeSaveDailyDraft(get);
  }, 250);
}

async function maybeSaveDailyDraft(get: () => Store) {
  const state = get();
  if (state.mode !== "daily" || !state.elim?.solo || !state.daily) return;
  if (state.phase !== "draft" && state.phase !== "matchup") return;
  const picks = dailyPickPayload(state.elim.picks[0] ?? []);
  if (!picks.length) return;
  try {
    await saveDailyDraft({ data: { picks } });
  } catch {
    /* next pick retries */
  }
}

async function maybeLockDaily(
  get: () => Store,
  set: (partial: Partial<ClientState> | ClientState) => void,
) {
  const state = get();
  if (state.mode !== "daily" || state.phase !== "matchup" || !state.elim?.solo || !state.daily?.hideWeek) return;
  const picks = dailyPickPayload(state.elim.picks[0]);
  try {
    const locked = await lockDaily({ data: { picks } });
    const live = get();
    if (live.mode !== "daily" || live.phase !== "matchup" || !live.elim) return;
    if (locked.status !== "done" || !locked.week) return;
    const next: ClientState = {
      ...live,
      daily: { day: live.daily?.day ?? locked.day, hideWeek: false },
      elim: { ...live.elim, week: locked.week },
    };
    persistLocal(next);
    set(next);
    void useProfile.getState().load();
  } catch {
    /* board write retries on the next flush */
  }
}

async function maybeLockWeekly(
  get: () => Store,
  set: (partial: Partial<ClientState> | ClientState) => void,
) {
  const state = get();
  if (state.mode !== "weekly" || state.phase !== "matchup" || !state.elim?.solo || state.weekly?.locked) return;
  const picks = weeklyLockPayload(state.elim.picks[0]);
  try {
    const locked = await lockWeekly({ data: { picks } });
    const live = get();
    if (live.mode !== "weekly" || live.phase !== "matchup" || !live.elim) return;
    if (locked.status === "locked" || locked.status === "forfeit") {
      const next: ClientState = {
        ...initialState,
        hydrated: true,
        netError: "Kickoff locked this week. Next board opens after the slate.",
      };
      persistLocal(next);
      persistNet(next);
      set(next);
      return;
    }
    if (locked.status !== "done") return;
    const next: ClientState = {
      ...live,
      weekly: {
        season: locked.season,
        week: locked.week,
        live: locked.live,
        locked: true,
        awarded: locked.awarded,
        paid: locked.paid,
        winner: locked.winner,
        score: locked.score ?? 0,
      },
    };
    persistLocal(next);
    set(next);
    void useProfile.getState().load();
  } catch {
    /* board write retries on the next flush */
  }
}
