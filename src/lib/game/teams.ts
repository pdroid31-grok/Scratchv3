import type { Team, TeamId } from "./types";

export const TEAMS: Record<TeamId, Team> = {
  ARI: { id: "ARI", city: "Arizona", nick: "Cardinals", primary: "#97233F", secondary: "#000000", fg: "#F4F4F5" },
  ATL: { id: "ATL", city: "Atlanta", nick: "Falcons", primary: "#A71930", secondary: "#000000", fg: "#F4F4F5" },
  BAL: { id: "BAL", city: "Baltimore", nick: "Ravens", primary: "#241773", secondary: "#9A8660", fg: "#F4F4F5" },
  BUF: { id: "BUF", city: "Buffalo", nick: "Bills", primary: "#00338D", secondary: "#C60C30", fg: "#F4F4F5" },
  CAR: { id: "CAR", city: "Carolina", nick: "Panthers", primary: "#0085CA", secondary: "#101820", fg: "#F4F4F5" },
  CHI: { id: "CHI", city: "Chicago", nick: "Bears", primary: "#0B162A", secondary: "#C83803", fg: "#F4F4F5" },
  CIN: { id: "CIN", city: "Cincinnati", nick: "Bengals", primary: "#FB4A04", secondary: "#000000", fg: "#0B0D0C" },
  CLE: { id: "CLE", city: "Cleveland", nick: "Browns", primary: "#311D00", secondary: "#FF3C00", fg: "#F4F4F5" },
  DAL: { id: "DAL", city: "Dallas", nick: "Cowboys", primary: "#041E42", secondary: "#869397", fg: "#F4F4F5" },
  DEN: { id: "DEN", city: "Denver", nick: "Broncos", primary: "#002244", secondary: "#FB4F14", fg: "#F4F4F5" },
  DET: { id: "DET", city: "Detroit", nick: "Lions", primary: "#0076B6", secondary: "#B0B7BC", fg: "#F4F4F5" },
  GB: { id: "GB", city: "Green Bay", nick: "Packers", primary: "#203731", secondary: "#C5B358", fg: "#F4F4F5" },
  HOU: { id: "HOU", city: "Houston", nick: "Texans", primary: "#03202F", secondary: "#A71930", fg: "#F4F4F5" },
  IND: { id: "IND", city: "Indianapolis", nick: "Colts", primary: "#002C5F", secondary: "#A2AAAD", fg: "#F4F4F5" },
  JAX: { id: "JAX", city: "Jacksonville", nick: "Jaguars", primary: "#006778", secondary: "#9F792C", fg: "#F4F4F5" },
  KC: { id: "KC", city: "Kansas City", nick: "Chiefs", primary: "#E31837", secondary: "#FFB81C", fg: "#F4F4F5" },
  LAC: { id: "LAC", city: "Los Angeles", nick: "Chargers", primary: "#0080C6", secondary: "#FFC20E", fg: "#0B0D0C" },
  LAR: { id: "LAR", city: "Los Angeles", nick: "Rams", primary: "#003594", secondary: "#FFA300", fg: "#F4F4F5" },
  LV: { id: "LV", city: "Las Vegas", nick: "Raiders", primary: "#000000", secondary: "#A5ACAF", fg: "#F4F4F5" },
  MIA: { id: "MIA", city: "Miami", nick: "Dolphins", primary: "#008E97", secondary: "#FC4C02", fg: "#F4F4F5" },
  MIN: { id: "MIN", city: "Minnesota", nick: "Vikings", primary: "#4F2683", secondary: "#FFC62F", fg: "#F4F4F5" },
  NE: { id: "NE", city: "New England", nick: "Patriots", primary: "#002244", secondary: "#C60C30", fg: "#F4F4F5" },
  NO: { id: "NO", city: "New Orleans", nick: "Saints", primary: "#101820", secondary: "#D3BC8D", fg: "#F4F4F5" },
  NYG: { id: "NYG", city: "New York", nick: "Giants", primary: "#0B2265", secondary: "#A71930", fg: "#F4F4F5" },
  NYJ: { id: "NYJ", city: "New York", nick: "Jets", primary: "#125740", secondary: "#000000", fg: "#F4F4F5" },
  PHI: { id: "PHI", city: "Philadelphia", nick: "Eagles", primary: "#004C54", secondary: "#A5ACAF", fg: "#F4F4F5" },
  PIT: { id: "PIT", city: "Pittsburgh", nick: "Steelers", primary: "#101820", secondary: "#FFB612", fg: "#F4F4F5" },
  SEA: { id: "SEA", city: "Seattle", nick: "Seahawks", primary: "#002244", secondary: "#69BE28", fg: "#F4F4F5" },
  SF: { id: "SF", city: "San Francisco", nick: "49ers", primary: "#AA0000", secondary: "#B3995D", fg: "#F4F4F5" },
  TB: { id: "TB", city: "Tampa Bay", nick: "Buccaneers", primary: "#D50A0A", secondary: "#0A0A0A", fg: "#F4F4F5" },
  TEN: { id: "TEN", city: "Tennessee", nick: "Titans", primary: "#0C2340", secondary: "#4B92DB", fg: "#F4F4F5" },
  WAS: { id: "WAS", city: "Washington", nick: "Commanders", primary: "#5A1414", secondary: "#FFB612", fg: "#F4F4F5" },
};

export function teamById(id: string): Team {
  return TEAMS[id as TeamId] ?? TEAMS.WAS;
}

export function teamLogoSrc(id: string): string {
  const team = teamById(id);
  return `/teams/${team.id}.png`;
}

export function playerTeams(player: { team: TeamId; teams?: TeamId[] }): TeamId[] {
  const listed = player.teams?.filter((id) => TEAMS[id]);
  if (listed && listed.length > 0) return listed.slice(0, 2);
  return [player.team];
}
