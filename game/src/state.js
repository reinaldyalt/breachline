// BREACHLINE — the one state object. Every module reads or writes this; nothing else
// keeps a copy of round, money, score or bomb state, so the HUD and the judge read the
// same truth. Phases: 'title' | 'buy' | 'live' | 'roundEnd' | 'matchEnd'.
export function createState() {
  return {
    phase: 'title',
    round: 1,
    maxRounds: 9,
    winRounds: 5,
    scoreUs: 0, // Vanguard (player team)
    scoreThem: 0, // Sentinels (bots)
    money: 800,
    roundTime: 100,
    buyTime: 18,
    roundEndTimer: 0,
    roundEndKind: '',
    roundEndText: '',
    bomb: {
      state: 'idle', // idle | planting | planted | defusing | exploded | defused
      site: null, // 'A' | 'B'
      progress: 0, // 0..1 plant/defuse progress
      fuse: 35,
      pos: null,
    },
    kills: 0,
    deaths: 0,
    killfeed: [],
    log: [],
  };
}

export function pushFeed(state, text) {
  state.killfeed.unshift(text);
  if (state.killfeed.length > 5) state.killfeed.pop();
}
