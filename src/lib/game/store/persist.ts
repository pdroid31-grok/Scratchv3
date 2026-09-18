import { applyAction, initialGame, type GameAction, type GameKind, type GameState } from "../engine";
import { getDaily } from "../daily-api";
import { isAvatarId, type AvatarId } from "../avatars";
import { useProfile } from "../profile-store";
import type { LotChoice, Seat } from "../types";
import { queueSaveDailyDraft } from "./daily";
import { queueSaveWeeklyDraft } from "./weekly";

export const LOCAL_KEY = "darkness-v9";
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

export interface GameActions {
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
export type StoreGet = () => Store;
export type StoreSet = (partial: Partial<ClientState> | ClientState) => void;

export const initialState: ClientState = {
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

export function lockJoinPrefill() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(JOIN_LOCK, "1");
  } catch {
    /* ignore */
  }
}

export async function profileSeat(name: string): Promise<{ name: string; avatarId: AvatarId }> {
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

export function persistLocal(state: ClientState) {
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

export function persistNet(state: ClientState) {
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

export function syncRoomSearch(code: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (code) url.searchParams.set("room", code);
  else url.searchParams.delete("room");
  const next = url.pathname + url.search + url.hash;
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (next !== current) window.history.replaceState({}, "", next);
}

export function pairAvatars(value: unknown): [AvatarId, AvatarId] {
  if (!Array.isArray(value) || value.length < 2) return ["poor", "poor"];
  return [
    isAvatarId(String(value[0])) ? value[0] : "poor",
    isAvatarId(String(value[1])) ? value[1] : "poor",
  ];
}

export function pairUserIds(value: unknown): [string | null, string | null] {
  if (!Array.isArray(value) || value.length < 2) return [null, null];
  const a = typeof value[0] === "string" && value[0] ? value[0] : null;
  const b = typeof value[1] === "string" && value[1] ? value[1] : null;
  return [a, b];
}

export function pairReady(value: unknown): [boolean, boolean] {
  if (!Array.isArray(value) || value.length < 2) return [false, false];
  return [Boolean(value[0]), Boolean(value[1])];
}

export function snapshot(state: ClientState): GameState {
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

export function gameLooksValid(parsed: Partial<GameState>): boolean {
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

export function hydrateStore(get: StoreGet, set: StoreSet) {
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
}

export function commitLocal(get: StoreGet, set: StoreSet, action: GameAction, actor?: Seat) {
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
  if (next.mode === "weekly") queueSaveWeeklyDraft(get);
}
