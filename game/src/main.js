// BREACHLINE — boot and the one loop. A fixed 60 Hz simulation feeds rendering at the
// display rate; rendering never writes simulation state. Player shooting, bot shots,
// the bomb, grenades and round events all run inside step(); frame() only moves the
// mouse look, polls input and paints. ?shot=start|play|buy|end stages a deterministic
// frame for a screenshot; ?auto=1 runs a simple autopilot (aim at the nearest visible
// enemy and fire) so the game can be verified headless.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createState, pushFeed } from './state.js';
import { createWorld, SPAWNS, SITES, pointInSite } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS } from './weapon.js';
import { createBots } from './bots.js';
import { createCombat } from './combat.js';
import { createHud } from './hud.js';
import { createRounds } from './rounds.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const auto = params.get('auto') === '1';
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = shot || auto ? mulberry32(seed) : Math.random;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const state = createState();
const world = createWorld(scene);
const combat = createCombat(scene);
const weapons = createWeapons(camera);
const hud = createHud(world.boxes);
const audio = createAudio();
const rounds = createRounds(state, hud, audio);
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const bots = createBots(scene, world, combat, random);

const body = player.state;
let playerHp = 100;
let playerAlive = true;
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let lastBeepSecond = -1;
let defuseByBot = 0;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const aimPoint = new THREE.Vector3();
const botRay = new THREE.Raycaster();

// The player as a foe entry for the bots' vision and shooting.
const playerFoe = { name: 'You', pos: body.position, alive: true, isPlayer: true };
const allySpawns = SPAWNS.allies.map((s, i) => ({ ...s, name: ['Dara', 'Kian'][i] }));
const enemySpawns = SPAWNS.enemies.map((s, i) => ({ ...s, name: ['Vex', 'Rook', 'Havoc', 'Sable'][i] }));

function resetEntities() {
  body.position.set(SPAWNS.player.x, 0, SPAWNS.player.z);
  body.velocity.set(0, 0, 0);
  body.yaw = SPAWNS.player.yaw;
  body.pitch = 0;
  playerHp = 100;
  playerAlive = true;
  playerFoe.alive = true;
  weapons.resetRound(true);
  bots.reset({ allies: allySpawns, enemies: enemySpawns });
  combat.clearGrenades();
  defuseByBot = 0;
  lastBeepSecond = -1;
  syncCamera();
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function hurtPlayer(damage, byName) {
  if (!playerAlive) return;
  playerHp -= damage;
  hud.damageFlash();
  audio.hurt();
  if (playerHp <= 0) {
    playerHp = 0;
    playerAlive = false;
    playerFoe.alive = false;
    state.deaths += 1;
    pushFeed(state, `${byName} eliminated you`);
  }
}

function damageBot(bot, damage, part, byPlayer) {
  const killed = bots.damage(bot, damage, part);
  combat.showSparks(bot.pos.clone().setY(1.3), new THREE.Vector3(0, 1, 0), PALETTE.red);
  if (killed) {
    pushFeed(state, `${byPlayer ? 'You' : 'Ally'} eliminated ${bot.name}${part === 'head' ? ' (headshot)' : ''}`);
    if (byPlayer) {
      state.kills += 1;
      rounds.awardKill();
      audio.kill();
    }
  } else if (byPlayer) audio.hit();
  return killed;
}

function playerShoot() {
  const def = weapons.def();
  if (!weapons.takeRound()) {
    audio.dryClick();
    weapons.reload();
    return false;
  }
  camera.getWorldDirection(direction);
  const origin = camera.position.clone();
  const spread = weapons.spread(player.groundSpeed());
  const result = combat.shoot(origin, direction, spread, def.range, world.shootables.concat(bots.allHitMeshes()), null, random);
  weapons.pullTrigger();
  player.recoil(def.recoil * (0.8 + random() * 0.4), (random() * 2 - 1) * def.recoil * 0.35);
  audio.shot();
  bots.noise(body.position.x, body.position.z, 20);
  hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve);
  if (result.hit && result.bot) {
    if (result.bot.team === 'us') {
      // No friendly fire: an ally in the line of fire stops the bullet, unharmed.
      combat.showSparks(result.point, new THREE.Vector3(0, 1, 0), PALETTE.teal);
      return true;
    }
    const dist = result.distance;
    const falloff = dist > 30 ? 0.75 : dist > 15 ? 0.9 : 1;
    const dmg = Math.round(def.damage * (result.part === 'head' ? def.headMult : 1) * falloff);
    const killed = damageBot(result.bot, dmg, result.part, true);
    hud.hitMarker(killed, killed ? 300 : 120);
  }
  return true;
}

function botShoot(bot, target) {
  // Muzzle at the bot's gun, aimed at the target's chest with distance-scaled error.
  muzzle.set(bot.pos.x, 1.45, bot.pos.z);
  const fwd = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
  muzzle.addScaledVector(fwd, 0.4);
  aimPoint.set(target.pos.x, 1.3, target.pos.z);
  const dist = muzzle.distanceTo(aimPoint);
  const err = 0.25 + dist * 0.035;
  aimPoint.x += (random() * 2 - 1) * err;
  aimPoint.y += (random() * 2 - 1) * err * 0.7;
  aimPoint.z += (random() * 2 - 1) * err;
  direction.copy(aimPoint).sub(muzzle).normalize();
  botRay.set(muzzle, direction);
  botRay.far = dist + 2;
  const blocked = botRay.intersectObjects(world.shootables, false)[0];
  const end = blocked ? blocked.point : aimPoint;
  combat.showTracer(muzzle, end);
  if (blocked && blocked.distance < dist - 0.3) return; // hit a wall first
  const moving = target.isPlayer ? player.groundSpeed() : 3;
  const p = Math.max(0.08, Math.min(0.62, 0.6 - dist * 0.011 - moving * 0.02 - (target.isPlayer && body.crouching ? 0.06 : 0)));
  if (random() > p) return;
  const dmg = 9 + Math.floor(random() * 8);
  if (target.isPlayer) {
    hurtPlayer(dmg, bot.name);
  } else {
    const killed = damageBot(target, dmg, 'body', false);
    if (killed) pushFeed(state, `${bot.name} eliminated ${target.name}`);
  }
  if (target.isPlayer) audio.enemyShot();
}

function explodeGrenade(pos) {
  audio.explosion();
  combat.showSparks(pos, new THREE.Vector3(0, 1, 0), PALETTE.accent);
  bots.noise(pos.x, pos.z, 30);
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.pos.x - pos.x, bot.pos.z - pos.z);
    if (d < 7) damageBot(bot, Math.round(110 * (1 - d / 7)), 'body', true);
  }
  const pd = Math.hypot(body.position.x - pos.x, body.position.z - pos.z);
  if (playerAlive && pd < 6) hurtPlayer(Math.round(70 * (1 - pd / 6)), 'Frag grenade');
}

function throwGrenade() {
  if (!weapons.useGrenade()) return;
  camera.getWorldDirection(direction);
  combat.throwGrenade(camera.position.clone(), direction.clone(), explodeGrenade);
  audio.shot();
  hud.setWeapon(weapons.def().name, weapons.state.grenades);
}

function plantStep(dt) {
  const bomb = state.bomb;
  const site = pointInSite(body.position.x, body.position.z);
  if (state.phase !== 'live') return;
  if (bomb.state === 'idle' && playerAlive && site && input.state.keys.has('KeyE')) {
    bomb.progress += dt / 3;
    bomb.site = site;
    if (bomb.progress >= 1) {
      bomb.state = 'planted';
      bomb.fuse = rounds.fuse();
      bomb.pos = body.position.clone();
      bomb.progress = 0;
      audio.plant();
      rounds.awardPlant();
      pushFeed(state, `Charge planted at site ${site}`);
      bots.noise(bomb.pos.x, bomb.pos.z, 45);
    }
  } else if (bomb.state === 'idle') {
    bomb.progress = 0;
    bomb.site = site;
  }
  if (bomb.state === 'planted') {
    const sec = Math.ceil(bomb.fuse);
    if (sec !== lastBeepSecond) {
      lastBeepSecond = sec;
      audio.beep();
    }
    // A living Sentinel that reaches the charge defuses it over 5 seconds.
    const near = bots.living('them').find((b) => bomb.pos && Math.hypot(b.pos.x - bomb.pos.x, b.pos.z - bomb.pos.z) < 1.6);
    if (near) {
      defuseByBot += dt / 5;
      if (defuseByBot >= 1) {
        bomb.state = 'defused';
        rounds.endRound('them', 'defused');
      }
    } else defuseByBot = Math.max(0, defuseByBot - dt / 5);
  }
}

function step(dt) {
  // Input-driven player actions (only while live and alive).
  if (state.phase === 'live' && playerAlive) {
    player.step(dt, input.state.keys);
    if (input.state.keys.has('KeyR')) weapons.reload();
    if (input.state.keys.has('Digit1')) weapons.switchTo('pistol');
    if (input.state.keys.has('Digit2')) weapons.switchTo('smg');
    if (input.state.keys.has('Digit3')) weapons.switchTo('rifle');
    if (input.state.keys.has('KeyG')) { input.state.keys.delete('KeyG'); throwGrenade(); }
  }
  weapons.step(dt);
  combat.step(dt);
  plantStep(dt);

  // Bots: enemies hunt the player + allies; allies hunt the enemies. They only
  // shoot once the round is live — never on the title screen or in the buy phase.
  const usFoes = [playerFoe, ...bots.living('us')].filter((f) => f.alive);
  const themFoes = bots.living('them');
  const shootCb = state.phase === 'live' ? botShoot : () => {};
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    if (bot.team === 'them') bots.step(bot, usFoes, dt, shootCb);
    else bots.step(bot, themFoes, dt, shootCb);
  }
  // Planted bomb pulls defenders toward the charge.
  if (state.bomb.state === 'planted' && state.bomb.pos) {
    for (const bot of bots.living('them')) {
      if (bot.state !== 'engage') {
        bot.investigate = { x: state.bomb.pos.x, z: state.bomb.pos.z };
        bot.state = 'investigate';
      }
    }
  }

  const worldState = {
    playerAlive,
    usAlive: (playerAlive ? 1 : 0) + bots.living('us').length,
    themAlive: bots.living('them').length,
  };
  const event = rounds.step(dt, worldState);
  if (event) handleEvent(event);
  const after = rounds.afterRoundEnd(dt);
  if (after) handleEvent(after);
}

function handleEvent(event) {
  if (event.type === 'roundStart') {
    hud.showBuy(false);
    hud.hideOverlay();
    resetEntities();
    if (!shot && started) input.requestLock();
  } else if (event.type === 'buyPhase') {
    resetEntities();
    hud.showBuy(true);
    hud.markOwned('', Object.keys(weapons.owned()));
    hud.setPrompt('Buy phase — press B to close, click a weapon to buy');
    if (document.pointerLockElement) document.exitPointerLock();
  } else if (event.type === 'roundEnd') {
    hud.showBuy(false);
    const won = event.winner === 'us';
    hud.showOverlay('roundEnd', {
      title: won ? 'ROUND WON' : 'ROUND LOST',
      copy: `${state.roundEndText}. Vanguard ${state.scoreUs} — ${state.scoreThem} Sentinels. Next round in a moment.`,
    });
    if (document.pointerLockElement) document.exitPointerLock();
  } else if (event.type === 'matchEnd') {
    const won = event.winner === 'us';
    hud.showOverlay('matchEnd', {
      title: won ? 'MATCH WON' : 'MATCH LOST',
      copy: `Final score Vanguard ${state.scoreUs} — ${state.scoreThem} Sentinels. Click to play again.`,
    });
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function onLockChange(locked) {
  if (shot || auto) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.showBuy(false);
    audio.unlock();
  } else if (state.phase === 'live' && playerAlive) {
    hud.showOverlay('paused', {});
  }
}

function updateHud() {
  hud.setHealth(playerHp);
  hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve);
  hud.setWeapon(weapons.def().name, weapons.state.grenades);
  hud.setMoney(state.money);
  hud.setScore(state.scoreUs, state.scoreThem);
  hud.setRound(state.round, state.maxRounds);
  const bomb = state.bomb;
  if (state.phase === 'buy') {
    hud.setTimer(state.buyTime, false);
    hud.setBomb('BUY PHASE', '');
  } else if (bomb.state === 'planted') {
    hud.setTimer(bomb.fuse, true);
    hud.setBomb(`CHARGE ${bomb.site} — ${Math.ceil(bomb.fuse)}s`, 'danger');
  } else if (bomb.state === 'idle' && bomb.progress > 0) {
    hud.setTimer(state.roundTime, false);
    hud.setBomb(`PLANTING ${Math.round(bomb.progress * 100)}%`, '');
  } else if (bomb.state === 'planted') {
    hud.setTimer(state.roundTime, false);
  } else {
    hud.setTimer(state.roundTime, state.roundTime < 15);
    hud.setBomb(defuseByBot > 0 ? `DEFUSING ${Math.round(defuseByBot * 100)}%` : '', defuseByBot > 0 ? 'danger' : '');
  }
  const site = pointInSite(body.position.x, body.position.z);
  if (state.phase === 'live' && playerAlive && bomb.state === 'idle' && site) {
    hud.setPrompt(`Hold E to plant the charge at site ${site}`);
  } else if (state.phase === 'live' && !playerAlive) {
    hud.setPrompt('You are down — your squad fights on');
  } else if (state.phase !== 'buy') {
    hud.setPrompt('');
  }
  hud.setFeed(state.killfeed);
  hud.setSpread(4 + weapons.spread(player.groundSpeed()) * 260 + (weapons.state.reloadLeft > 0 ? 6 : 0));
  hud.drawMinimap(body.position, body.yaw, bots.living('us'), bots.living('them'), bomb.site);
}

// Autopilot: walk toward the nearest visible enemy, aim at it and fire. Used only
// for headless verification (?auto=1); it plays the same code paths as a human.
function autopilot(dt) {
  if (state.phase !== 'live') return;
  const foes = bots.living('them');
  if (!foes.length || !playerAlive) return;
  let best = null;
  let bestD = Infinity;
  for (const f of foes) {
    const d = Math.hypot(f.pos.x - body.position.x, f.pos.z - body.position.z);
    if (d < bestD) { bestD = d; best = f; }
  }
  if (!best) return;
  aimPoint.set(best.pos.x, 1.35, best.pos.z);
  aimAt(aimPoint);
  const seen = bots.canSee({ pos: body.position, yaw: body.yaw }, best.pos);
  if (seen && weapons.ready()) playerShoot();
  else if (!seen) {
    // Walk toward the enemy's waypoint lane.
    const dx = best.pos.x - body.position.x;
    const dz = best.pos.z - body.position.z;
    input.state.keys.add(Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'KeyD' : 'KeyA') : (dz > 0 ? 'KeyS' : 'KeyW'));
    setTimeout(() => input.state.keys.clear(), 50);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (look.x || look.y) player.look(look.x, look.y);
    if (auto) autopilot(dt);
    if (input.state.firing && state.phase === 'live' && playerAlive && weapons.ready()) playerShoot();
    if (input.state.keys.has('KeyB') && state.phase === 'buy') {
      input.state.keys.delete('KeyB');
      hud.showBuy(document.getElementById('buy-menu').hidden);
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    updateHud();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i++) step(FIXED_STEP);
  syncCamera();
  updateHud();
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false);
  if (name === 'start') {
    resetEntities();
    body.position.set(-12, 0, 11);
    body.yaw = 0;
    body.pitch = 0.02;
    settle(10);
    aimAt(new THREE.Vector3(0, 1.6, -8));
    hud.showOverlay('start', {});
  } else if (name === 'play') {
    rounds.startMatch();
    resetEntities();
    rounds.startRound();
    // Stage a mid-lane firefight: two Sentinels in the open, one ally beside us.
    const enemies = bots.living('them');
    enemies[0].pos.set(0, 0, -4);
    enemies[1].pos.set(4, 0, -6);
    enemies[2].pos.set(-8, 0, -9);
    body.position.set(-1, 0, 6);
    body.yaw = 0;
    settle(8);
    aimAt(new THREE.Vector3(0, 1.35, -4));
    playerShoot();
    settle(2);
    aimAt(new THREE.Vector3(0, 1.35, -4));
  } else if (name === 'buy') {
    rounds.startMatch();
    resetEntities();
    state.money = 4200;
    hud.buildBuy(() => {});
    hud.showBuy(true);
    hud.markOwned('', ['pistol']);
    body.position.set(-12, 0, 11);
    settle(10);
    aimAt(new THREE.Vector3(0, 1.6, -8));
  } else if (name === 'end') {
    rounds.startMatch();
    resetEntities();
    rounds.startRound();
    state.scoreUs = 1;
    state.roundEndText = 'SQUAD WIPED';
    hud.showOverlay('roundEnd', {
      title: 'ROUND WON',
      copy: 'SQUAD WIPED. Vanguard 1 — 0 Sentinels. Next round in a moment.',
    });
    body.position.set(-1, 0, 6);
    settle(10);
    aimAt(new THREE.Vector3(0, 1.35, -4));
  }
  updateHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    updateHud();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

hud.buildBuy((id) => {
  if (rounds.buy(id, weapons)) {
    hud.markOwned('', [...Object.keys(weapons.owned()), ...(weapons.state.grenades > 0 ? ['grenade'] : [])]);
    updateHud();
  }
});
hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (state.phase === 'title') {
    rounds.startMatch();
    resetEntities();
    hud.hideOverlay();
    input.requestLock();
  } else if (state.phase === 'matchEnd') {
    rounds.startMatch();
    resetEntities();
    hud.hideOverlay();
    input.requestLock();
  } else if (state.phase === 'roundEnd') {
    hud.hideOverlay();
    input.requestLock();
  } else {
    input.requestLock();
  }
});

// Debug handle for headless verification: state, player and bots, read-only-ish.
window.__game = {
  state,
  get playerHp() { return playerHp; },
  get playerAlive() { return playerAlive; },
  get playerPos() { return { x: body.position.x, y: body.position.y, z: body.position.z }; },
  get botsAlive() { return bots.bots.filter((b) => b.alive).length; },
  get enemiesAlive() { return bots.living('them').length; },
  get alliesAlive() { return bots.living('us').length; },
  shoot: () => { if (weapons.ready()) playerShoot(); },
  plant: () => { input.state.keys.add('KeyE'); },
  unplant: () => { input.state.keys.delete('KeyE'); },
  teleport: (x, z) => { body.position.set(x, 0, z); body.velocity.set(0, 0, 0); syncCamera(); },
};

resetEntities();
if (auto) {
  // Headless verification starts straight into a live round (no buy wait).
  rounds.startMatch();
  rounds.startRound();
  resetEntities();
}
syncCamera();
updateHud();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
