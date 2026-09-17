export function clipGm(name: string): string {
  return clipDisplayName(name) || "GM";
}

/** Trimmed in-game name, or empty if they never set one. */
export function clipDisplayName(name: string): string {
  const trimmed = name.trim().slice(0, 16);
  if (!trimmed || trimmed.toLowerCase() === "gm") return "";
  return trimmed;
}

/** Pat-only bank watch. Not Ty, not anyone else. */
export function isBankCommish(name: string): boolean {
  const key = name.trim().toLowerCase();
  return key === "pat" || key === "pastry pat";
}

/** Auction-era leftover profiles. Hide from public boards; do not delete the user rows. */
export const HIDDEN_BOARD_IDS = new Set([
  "L2L2Tf1HXAeB5rhgLvhogF921BKsICsN",
  "WJ5wZKjoZwydfPBf5FrkiOdwYarlw7b7",
  "Th7Ewogxh5Ul0nRrTQgs7tmP45rePO3Q",
  "t4GKnuNe18istHzOAvqGUgwVVnlV5WZ3",
  "hxIAsCe4u3Ojx0jq5Zvvm2gsIcVeJw1A",
  "38GXVpMo8GE8bERLYLHaoQF4CPBjvUS0",
  "B8FgPeYF2jVeLnfgd20PE8FYCpmpsC9n",
  "v783SxZeXud3WKr9H7q7pcgFypgIuGsY",
  "d9UdHOqeb48BAXYizwiBkNOBGSB1jtXP",
  "5nWDuHgSRx1TLr0oeKtiStulZzievyRq",
  "Qxo7D6xMnqUdJ2pTikGalBsvfoLdd4MY",
]);

/** Hide from public boards by display/auth name. Do not delete the user. */
export const HIDDEN_BOARD_NAMES = new Set(["nightwatch", "testpg"]);

export function isHiddenBoardId(id?: string | null): boolean {
  return Boolean(id && HIDDEN_BOARD_IDS.has(id));
}

export function isHiddenBoardName(name?: string | null): boolean {
  return Boolean(name && HIDDEN_BOARD_NAMES.has(name.trim().toLowerCase()));
}

export function hiddenBoardIdSql(column: string): string {
  const list = [...HIDDEN_BOARD_IDS].map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
  return list ? `${column} not in (${list})` : "true";
}

export function hiddenBoardNameSql(displayCol = "p.display_name", authCol = "u.name"): string {
  const list = [...HIDDEN_BOARD_NAMES].map((n) => `'${n.replace(/'/g, "''")}'`).join(",");
  return `lower(trim(coalesce(nullif(nullif(trim(${displayCol}), ''), 'GM'), nullif(trim(${authCol}), ''), ''))) not in (${list})`;
}

export function opponentKey(name: string): string {
  return clipGm(name).toLowerCase();
}

export function nightKey(input: {
  names: [string, string];
  nights: number;
  scores: [number, number];
  series: [number, number];
  saleIds: string[];
  kind?: "auction" | "elimination";
}): string {
  return [
    input.kind === "elimination" ? "elim" : "auc",
    clipGm(input.names[0]),
    clipGm(input.names[1]),
    `n${input.nights}`,
    input.scores.join("-"),
    input.series.join("-"),
    input.saleIds.join("."),
  ]
    .join("|")
    .slice(0, 240);
}

export type HostedNightLookup = {
  seat: 0 | 1;
  names: [string, string];
  kind: "auction" | "elimination";
  won: boolean | null;
  score: number;
  opponentScore: number;
  lowScore: number;
  nights: number;
};

export type HostedNightClient = {
  roomCode: string;
  token: string;
  seat: 0 | 1;
  nights: number;
  kind: "auction" | "elimination";
  won: boolean | null;
  score: number;
  opponentScore: number;
  lowScore: number;
  opponentName: string;
  gmName: string;
};

export function hostedNightKey(code: string, nights: number, kind: "auction" | "elimination", seat: 0 | 1): string {
  return `host:${code}:${nights}:${kind}:s${seat}`;
}

/** Room gone, archive missing — still write for a signed-in hosted match. */
export function planHostedNightWrite(data: HostedNightClient, hosted: HostedNightLookup | null) {
  if (!data.roomCode || !data.token) return null;
  const seat = hosted?.seat ?? data.seat;
  const kind = hosted?.kind ?? data.kind;
  const nights = hosted?.nights ?? data.nights;
  const won = hosted ? hosted.won : data.won;
  const score = hosted ? hosted.score : data.score;
  const opponentScore = hosted ? hosted.opponentScore : data.opponentScore;
  const lowScore = hosted ? hosted.lowScore : data.lowScore;
  const opponentName = hosted ? clipGm(hosted.names[seat === 0 ? 1 : 0]) : clipGm(data.opponentName);
  const gmName = (hosted ? clipDisplayName(hosted.names[seat]) : "") || clipDisplayName(data.gmName);
  return {
    nightKey: hostedNightKey(data.roomCode, nights, kind, seat),
    opponentName,
    gmName,
    won,
    score,
    opponentScore,
    lowScore,
    kind,
  };
}
