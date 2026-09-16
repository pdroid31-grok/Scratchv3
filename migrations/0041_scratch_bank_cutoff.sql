-- Scratch bank starts 2026-09-15 America/New_York.
-- Historic Daily scores stay on the board but do not mint tickets.
-- Unused credits reset; already-scratched cards (payouts on the books) stay.

delete from darkness_scratch_cards
 where scratched_at is null;
