// BREACHLINE — palette. One chosen palette: dusk freight yard, warm amber accent,
// teal for the player's team (Vanguard), red for the defenders (Sentinels).
export const PALETTE = {
  canvas: '#17130f',
  surface: '#23201b',
  hairline: '#3a332a',
  ink: '#f2ead9',
  muted: '#a89e8a',
  accent: '#f0a830',
  teal: '#35c4a8',
  red: '#e5484d',
  siteA: '#f0a830',
  siteB: '#35c4a8',
};

export function shade(name) {
  return PALETTE[name];
}
