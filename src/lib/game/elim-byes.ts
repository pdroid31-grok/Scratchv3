import type { TeamId } from "./types";
import { ELIM_LEGACY_BYES } from "./elim-legacy-byes";

/** Official regular-season bye week (1-based) by year and team. */
export const ELIM_BYES: Record<number, Record<TeamId, number>> = {
  2016: { ARI: 9, ATL: 11, BAL: 8, BUF: 10, CAR: 7, CHI: 9, CIN: 9, CLE: 13, DAL: 7, DEN: 11, DET: 10, GB: 4, HOU: 9, IND: 10, JAX: 5, KC: 5, LAC: 11, LAR: 8, LV: 10, MIA: 8, MIN: 6, NE: 9, NO: 5, NYG: 8, NYJ: 11, PHI: 4, PIT: 8, SEA: 5, SF: 8, TB: 6, TEN: 13, WAS: 9 },
  2017: { ARI: 8, ATL: 5, BAL: 10, BUF: 6, CAR: 11, CHI: 9, CIN: 6, CLE: 9, DAL: 6, DEN: 5, DET: 7, GB: 8, HOU: 7, IND: 11, JAX: 8, KC: 10, LAC: 9, LAR: 8, LV: 10, MIA: 1, MIN: 9, NE: 9, NO: 5, NYG: 8, NYJ: 11, PHI: 10, PIT: 9, SEA: 6, SF: 11, TB: 1, TEN: 8, WAS: 5 },
  2018: { ARI: 9, ATL: 8, BAL: 10, BUF: 11, CAR: 4, CHI: 5, CIN: 9, CLE: 11, DAL: 8, DEN: 10, DET: 6, GB: 7, HOU: 10, IND: 9, JAX: 9, KC: 12, LAC: 8, LAR: 12, LV: 7, MIA: 11, MIN: 10, NE: 11, NO: 6, NYG: 9, NYJ: 11, PHI: 9, PIT: 7, SEA: 7, SF: 11, TB: 5, TEN: 8, WAS: 4 },
  2019: { ARI: 12, ATL: 9, BAL: 8, BUF: 6, CAR: 7, CHI: 6, CIN: 9, CLE: 7, DAL: 8, DEN: 10, DET: 5, GB: 11, HOU: 10, IND: 6, JAX: 10, KC: 12, LAC: 12, LAR: 9, LV: 6, MIA: 5, MIN: 12, NE: 10, NO: 9, NYG: 11, NYJ: 4, PHI: 10, PIT: 7, SEA: 11, SF: 4, TB: 7, TEN: 11, WAS: 10 },
  2020: { ARI: 8, ATL: 10, BAL: 7, BUF: 11, CAR: 13, CHI: 11, CIN: 9, CLE: 9, DAL: 10, DEN: 5, DET: 5, GB: 5, HOU: 8, IND: 7, JAX: 8, KC: 10, LAC: 6, LAR: 9, LV: 6, MIA: 7, MIN: 7, NE: 5, NO: 6, NYG: 11, NYJ: 10, PHI: 9, PIT: 4, SEA: 6, SF: 11, TB: 13, TEN: 4, WAS: 8 },
  2021: { ARI: 12, ATL: 6, BAL: 8, BUF: 7, CAR: 13, CHI: 10, CIN: 10, CLE: 13, DAL: 7, DEN: 11, DET: 9, GB: 13, HOU: 10, IND: 14, JAX: 7, KC: 12, LAC: 7, LAR: 11, LV: 8, MIA: 14, MIN: 7, NE: 14, NO: 6, NYG: 10, NYJ: 6, PHI: 14, PIT: 7, SEA: 9, SF: 6, TB: 9, TEN: 13, WAS: 9 },
  2022: { ARI: 13, ATL: 14, BAL: 10, BUF: 7, CAR: 13, CHI: 14, CIN: 10, CLE: 9, DAL: 9, DEN: 9, DET: 6, GB: 14, HOU: 6, IND: 14, JAX: 11, KC: 8, LAC: 8, LAR: 7, LV: 6, MIA: 11, MIN: 7, NE: 10, NO: 14, NYG: 9, NYJ: 10, PHI: 7, PIT: 9, SEA: 11, SF: 9, TB: 11, TEN: 6, WAS: 14 },
  2023: { ARI: 14, ATL: 11, BAL: 13, BUF: 13, CAR: 7, CHI: 13, CIN: 7, CLE: 5, DAL: 7, DEN: 9, DET: 9, GB: 6, HOU: 7, IND: 11, JAX: 9, KC: 10, LAC: 5, LAR: 10, LV: 13, MIA: 10, MIN: 13, NE: 11, NO: 11, NYG: 13, NYJ: 7, PHI: 10, PIT: 6, SEA: 5, SF: 9, TB: 5, TEN: 7, WAS: 14 },
  2024: { ARI: 11, ATL: 12, BAL: 14, BUF: 12, CAR: 11, CHI: 7, CIN: 12, CLE: 10, DAL: 7, DEN: 14, DET: 5, GB: 10, HOU: 14, IND: 14, JAX: 12, KC: 6, LAC: 5, LAR: 6, LV: 10, MIA: 6, MIN: 6, NE: 14, NO: 12, NYG: 11, NYJ: 12, PHI: 5, PIT: 9, SEA: 10, SF: 9, TB: 11, TEN: 5, WAS: 14 },
  2025: { ARI: 8, ATL: 5, BAL: 7, BUF: 7, CAR: 14, CHI: 5, CIN: 10, CLE: 9, DAL: 10, DEN: 12, DET: 8, GB: 5, HOU: 6, IND: 11, JAX: 8, KC: 10, LAC: 12, LAR: 8, LV: 8, MIA: 12, MIN: 6, NE: 14, NO: 11, NYG: 14, NYJ: 9, PHI: 9, PIT: 5, SEA: 8, SF: 14, TB: 9, TEN: 10, WAS: 12 },
};

export function teamBye(year: number, team: TeamId): number {
  return ELIM_BYES[year]?.[team] ?? ELIM_LEGACY_BYES[year]?.[team] ?? 0;
}
