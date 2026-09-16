/** Claim remap is retired. Existing claimed_by rows stay. Do not import from client modules. */
import type { ClaimableBooksResult, ClaimBookResult } from "./claim-types";

export async function listClaimableBooksHandler(_args: {
  context: { userId: string };
}): Promise<ClaimableBooksResult> {
  return { eligible: false, books: [] };
}

export async function claimExistingBookHandler(_args: {
  context: { userId: string };
  data: { name: string };
}): Promise<ClaimBookResult> {
  return { ok: false, reason: "ineligible" };
}
