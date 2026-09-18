export const MID_PP = 8;
export const MAX_LEV = 3;

export const ENTRY_TIERS = [
  { distPp: 2, lev: 0.3, spreads: "6% / 10%" },
  { distPp: 3, lev: 0.6, spreads: "5% / 11%" },
  { distPp: 4.5, lev: 1, spreads: "3.5% / 12.5%" },
  { distPp: 6, lev: 1.5, spreads: "2% / 14%" },
  { distPp: 10, lev: 2, spreads: "−2% / 18%" },
  { distPp: 14, lev: 2.5, spreads: "−6% / 22%" },
  { distPp: 18, lev: 3, spreads: "−10% / 26%" },
] as const;

export const EXIT_TIERS = [
  { distPp: 0, lev: 0, spreads: "8%" },
  { distPp: 1, lev: 0.3, spreads: "7% / 9%" },
  { distPp: 2, lev: 0.6, spreads: "6% / 10%" },
  { distPp: 3.5, lev: 1, spreads: "4.5% / 11.5%" },
  { distPp: 5, lev: 1.5, spreads: "3% / 13%" },
  { distPp: 8, lev: 2, spreads: "0% / 16%" },
  { distPp: 10, lev: 2.5, spreads: "−2% / 18%" },
] as const;
