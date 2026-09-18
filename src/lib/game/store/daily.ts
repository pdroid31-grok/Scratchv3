import { applyAction } from "../engine";
import { dailyPickPayload, resumeDailyGame, startDailyGame } from "../daily";
import { claimDaily, lockDaily, saveDailyDraft } from "../daily-api";
import type { ElimYear } from "../elim-data";
import { useProfile } from "../profile-store";
import type { AvatarId } from "../avatars";
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

function openDailyResults(
  get: StoreGet,
  set: StoreSet,
  claimed: { day: string; year: number; week: number | null; score: number | null; picks?: { slot: string; id: string }[] },
  seat: { name: string; avatarId: AvatarId },
) {
  const live = get();
  const week = Number(claimed.week) || live.elim?.week || 0;
  const rawScore = Number(claimed.score);
  const daily = {
    day: claimed.day,
    hideWeek: false,
    score: Number.isFinite(rawScore) ? rawScore : undefined,
  };
  const keepLive = live.mode === "daily" && Boolean(live.elim) && live.phase !== "setup";
  let next: ClientState;
  if (keepLive && live.elim) {
    next = {
      ...live,
      busy: false,
      netError: null,
      daily: { ...daily, day: live.daily?.day ?? claimed.day },
      elim: { ...live.elim, week: week || live.elim.week },
    };
  } else {
    const year = claimed.year as ElimYear;
    const picks = claimed.picks ?? [];
    const dealt = picks.length
      ? resumeDailyGame(seat.name, year, claimed.day, seat.avatarId, picks)
      : startDailyGame(seat.name, year, claimed.day, seat.avatarId);
    next = {
      ...initialState,
      ...dealt,
      hydrated: true,
      mode: "daily",
      mySeat: 0,
      busy: false,
      netError: null,
      daily,
      elim: dealt.elim ? { ...dealt.elim, week: week || dealt.elim.week } : dealt.elim,
    };
  }
  if (next.phase === "matchup") {
    const revealed = applyAction(next, { type: "startReveal" });
    next = { ...next, ...revealed, daily: next.daily };
  }
  if (next.phase !== "results" && next.phase !== "reveal") {
    next = { ...next, phase: "results" };
  }
  persistLocal(next);
  persistNet(next);
  lockJoinPrefill();
  set(next);
}

export async function startDaily(get: StoreGet, set: StoreSet) {
  set({ busy: true, netError: null });
  try {
    const seat = await profileSeat("");
    const claimed = await claimDaily({ data: {} });
    if (claimed.status === "signed_out") {
      if (get().mode === "daily") {
        const cleared: ClientState = {
          ...initialState,
          hydrated: true,
          busy: false,
          netError: "Sign in to play Daily Elimination.",
        };
        persistLocal(cleared);
        persistNet(cleared);
        set(cleared);
        return;
      }
      set({ busy: false, netError: "Sign in to play Daily Elimination." });
      return;
    }
    if (claimed.status === "done") {
      openDailyResults(get, set, claimed, seat);
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
      ? resumeDailyGame(seat.name, claimed.year as ElimYear, claimed.day, seat.avatarId, serverPicks)
      : startDailyGame(seat.name, claimed.year as ElimYear, claimed.day, seat.avatarId);
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
    if (locked.status !== "done") {
      set({ netError: "Could not lock today’s daily." });
      return;
    }
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
    set({ netError: "Could not lock today’s daily." });
  }
}
