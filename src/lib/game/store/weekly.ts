import { applyWeeklyLive, resumeWeeklyGame, startWeeklyGame, unpackWeeklyBoard, weeklyCenterGame, weeklyLockPayload } from "../weekly";
import { claimWeekly, lockWeekly, resumeWeekly, saveWeeklyDraft, weeklyBoardPack } from "../weekly-api";
import { useProfile } from "../profile-store";
import {
  type ClientState,
  type StoreGet,
  type StoreSet,
  initialState,
  lockJoinPrefill,
  persistLocal,
  persistNet,
  profileSeat,
} from "./persist";

export async function startWeekly(get: StoreGet, set: StoreSet) {
  set({ busy: true, netError: null });
  try {
    const seat = await profileSeat("");
    const claimed = await claimWeekly({ data: {} });
    if (claimed.status === "done") {
      set({ busy: false });
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
    const serverPicks = claimed.picks ?? [];
    if (
      live.mode === "weekly" &&
      live.weekly?.season === claimed.season &&
      live.weekly?.week === claimed.week &&
      live.phase === "draft" &&
      !live.weekly.locked &&
      claimed.status === "playing"
    ) {
      const localCount = live.elim?.picks[0]?.length ?? 0;
      if (localCount >= serverPicks.length) {
        set({ busy: false });
        return;
      }
    }
    const pack = await weeklyBoardPack({ data: {} });
    if (!pack) {
      set({ busy: false, netError: "This week’s board is locked." });
      return;
    }
    const pool = unpackWeeklyBoard(pack.board, pack.week);
    const dealt = serverPicks.length
      ? resumeWeeklyGame(seat.name, pack.season, pack.week, pool, seat.avatarId, serverPicks)
      : startWeeklyGame(seat.name, pack.season, pack.week, pool, seat.avatarId);
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
    if (next.phase === "matchup") void maybeLockWeekly(get, set);
  } catch {
    set({ busy: false, netError: "Could not start this week’s board." });
  }
}

export async function openWeeklyCenter(get: StoreGet, set: StoreSet) {
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
}

export async function refreshWeekly(get: StoreGet, set: StoreSet) {
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
}

export function queueSaveWeeklyDraft(get: StoreGet) {
  void maybeSaveWeeklyDraft(get);
}

export async function maybeSaveWeeklyDraft(get: StoreGet) {
  const state = get();
  if (state.mode !== "weekly" || !state.elim?.solo || state.weekly?.locked) return;
  if (state.phase !== "draft" && state.phase !== "matchup") return;
  const picks = weeklyLockPayload(state.elim.picks[0] ?? []);
  if (!picks.length) return;
  try {
    await saveWeeklyDraft({ data: { picks } });
  } catch {
    /* next pick retries */
  }
}

export async function maybeLockWeekly(get: StoreGet, set: StoreSet) {
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
