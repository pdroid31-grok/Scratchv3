import { applyAction } from "../engine";
import { dailyPickPayload, resumeDailyGame, startDailyGame } from "../daily";
import { claimDaily, lockDaily, saveDailyDraft } from "../daily-api";
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

export async function startDaily(get: StoreGet, set: StoreSet) {
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
    const serverPicks = claimed.picks ?? [];
    if (live.mode === "daily" && live.daily?.day === claimed.day && live.phase !== "setup") {
      const localCount = live.elim?.picks[0]?.length ?? 0;
      if (localCount >= serverPicks.length) {
        set({ busy: false });
        if (live.phase === "matchup") void maybeLockDaily(get, set);
        return;
      }
    }
    const dealt = serverPicks.length
      ? resumeDailyGame(seat.name, claimed.year as import("../elim-data").ElimYear, claimed.day, seat.avatarId, serverPicks)
      : startDailyGame(seat.name, claimed.year as import("../elim-data").ElimYear, claimed.day, seat.avatarId);
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
    if (next.phase === "matchup") void maybeLockDaily(get, set);
  } catch {
    set({ busy: false, netError: "Could not start today’s daily." });
  }
}

export function queueSaveDailyDraft(get: StoreGet) {
  void maybeSaveDailyDraft(get);
}

export async function maybeSaveDailyDraft(get: StoreGet) {
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

export async function maybeLockDaily(get: StoreGet, set: StoreSet) {
  const state = get();
  if (state.mode !== "daily" || state.phase !== "matchup" || !state.elim?.solo || !state.daily?.hideWeek) return;
  const picks = dailyPickPayload(state.elim.picks[0]);
  try {
    const locked = await lockDaily({ data: { picks } });
    const live = get();
    if (live.mode !== "daily" || live.phase !== "matchup" || !live.elim) return;
    if (locked.status !== "done") return;
    const week = locked.week || live.elim.week;
    const score = Number(locked.score);
    const scored: ClientState = {
      ...live,
      daily: { day: live.daily?.day ?? locked.day, hideWeek: false, score: Number.isFinite(score) ? score : undefined },
      elim: { ...live.elim, week },
    };
    const revealed = applyAction(scored, { type: "startReveal" });
    const next: ClientState = { ...scored, ...revealed };
    persistLocal(next);
    set(next);
    void useProfile.getState().load();
  } catch {
    /* board write retries on the next flush */
  }
}
