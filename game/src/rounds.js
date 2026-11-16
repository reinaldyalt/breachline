// BREACHLINE — rounds and economy. One job: the round clock, the buy phase, win/loss
// detection and the money that flows between rounds. main.js owns the entities and
// acts on the events this module returns ('roundEnd' / 'matchEnd'); this module never
// touches the scene. First to 5 round wins takes the match (max 9 rounds).
import { WEAPONS } from './weapon.js';
import { pushFeed } from './state.js';

const KILL_MONEY = 300;
const WIN_MONEY = 3250;
const LOSS_MONEY = 1900;
const PLANT_MONEY = 300;
const ROUND_TIME = 100;
const BUY_TIME = 18;
const BOMB_FUSE = 35;

export function createRounds(state, hud, audio) {
  function award(amount, why) {
    state.money += amount;
    pushFeed(state, `+$${amount} ${why}`);
  }

  function startMatch() {
    state.round = 1;
    state.scoreUs = 0;
    state.scoreThem = 0;
    state.money = 800;
    state.kills = 0;
    state.deaths = 0;
    state.killfeed = [];
    state.phase = 'buy';
    state.buyTime = BUY_TIME;
    state.bomb = { state: 'idle', site: null, progress: 0, fuse: BOMB_FUSE, pos: null };
  }

  function startRound() {
    state.phase = 'live';
    state.roundTime = ROUND_TIME;
    state.bomb = { state: 'idle', site: null, progress: 0, fuse: BOMB_FUSE, pos: null };
  }

  function endRound(winner, reason) {
    state.phase = 'roundEnd';
    state.roundEndTimer = 4;
    state.roundEndKind = winner;
    if (winner === 'us') {
      state.scoreUs += 1;
      award(WIN_MONEY, 'round win');
      audio.roundWin();
    } else {
      state.scoreThem += 1;
      award(LOSS_MONEY, 'round loss');
      audio.roundLose();
    }
    const titles = {
      elimination: winner === 'us' ? 'SQUAD WIPED' : 'SQUAD ELIMINATED',
      detonation: 'CHARGE DETONATED',
      defused: 'CHARGE DEFUSED',
      timeout: 'TIME EXPIRED',
      bombLost: 'CHARGE LOST',
    };
    state.roundEndText = titles[reason] || reason;
    return { type: 'roundEnd', winner, reason };
  }

  // Called every fixed step while phase is 'buy' or 'live'. Returns an event or null.
  function step(dt, world) {
    if (state.phase === 'buy') {
      state.buyTime -= dt;
      if (state.buyTime <= 0) {
        startRound();
        return { type: 'roundStart' };
      }
      return null;
    }
    if (state.phase !== 'live') return null;
    state.roundTime -= dt;
    const bomb = state.bomb;
    if (bomb.state === 'planted') {
      bomb.fuse -= dt;
      if (bomb.fuse <= 0) {
        bomb.state = 'exploded';
        return endRound('us', 'detonation');
      }
    }
    if (!world.playerAlive && world.usAlive === 0) {
      if (bomb.state === 'planted') return null; // fuse / defuse decides it now
      return endRound('them', 'elimination');
    }
    if (world.themAlive === 0) {
      if (bomb.state === 'planted') return endRound('us', 'detonation');
      return endRound('us', 'elimination');
    }
    if (state.roundTime <= 0) {
      if (bomb.state === 'planted') return endRound('us', 'detonation');
      return endRound('them', 'timeout');
    }
    return null;
  }

  function afterRoundEnd(dt) {
    if (state.phase !== 'roundEnd') return null;
    state.roundEndTimer -= dt;
    if (state.roundEndTimer > 0) return null;
    if (state.scoreUs >= state.winRounds || state.scoreThem >= state.winRounds || state.round >= state.maxRounds) {
      state.phase = 'matchEnd';
      return { type: 'matchEnd', winner: state.scoreUs > state.scoreThem ? 'us' : 'them' };
    }
    state.round += 1;
    state.phase = 'buy';
    state.buyTime = BUY_TIME;
    return { type: 'buyPhase' };
  }

  function buy(id, weapons) {
    if (state.phase !== 'buy') return false;
    if (id === 'grenade') {
      if (state.money < 300) return false;
      state.money -= 300;
      weapons.buyGrenade();
      audio.buy();
      return true;
    }
    const def = WEAPONS[id];
    if (!def || state.money < def.price) return false;
    if (weapons.owned()[id]) return false;
    state.money -= def.price;
    weapons.buy(id);
    weapons.switchTo(id);
    audio.buy();
    return true;
  }

  return {
    startMatch, startRound, endRound, step, afterRoundEnd, buy,
    awardKill() { award(KILL_MONEY, 'elimination'); },
    awardPlant() { award(PLANT_MONEY, 'charge planted'); },
    roundTime() { return ROUND_TIME; },
    buyTime() { return BUY_TIME; },
    fuse() { return BOMB_FUSE; },
  };
}
