/** Public Play-home faces. No signed-in score and no New Day / Submit. */

export type PlayFace = {
  id: string;
  name: string;
  avatarId: string;
  score: number;
};

export type PlayStrips = {
  etDay: string;
  season: number;
  week: number;
  yesterdayWinner: PlayFace | null;
  todayLeader: PlayFace | null;
  seasonLeader: PlayFace | null;
  weekLeader: PlayFace | null;
  weekLive: boolean;
};

export async function fetchPlayStrips(): Promise<PlayStrips | null> {
  try {
    const res = await fetch("/api/play-strips", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as PlayStrips;
    if (!body || typeof body.etDay !== "string" || typeof body.weekLive !== "boolean") return null;
    return body;
  } catch {
    return null;
  }
}
