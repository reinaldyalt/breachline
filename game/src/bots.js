// BREACHLINE — bots. Two squads of simple soldiers: Vanguard allies follow the player
// toward a site, Sentinel defenders hold and patrol the sites and mid. Each bot is a
// small state machine — hold, patrol, investigate (a noise), chase (a seen enemy),
// engage (shooting) — with a reaction delay, burst fire, and vision that needs line
// of sight, so a bot never shoots through a wall and never knows where you are until
// it sees you, hears a shot, or a teammate calls it out.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WAYPOINTS } from './world.js';

const BOT_SPEED = 3.1;
const BOT_HP = 100;
const VISION_RANGE = 26;
const VISION_HALF_FOV = 1.15; // ~66 degrees each side
const REACT_TIME = 0.45;
const BURST = 3;
const BURST_GAP = 0.9;

function buildBody(team) {
  const color = team === 'us' ? PALETTE.teal : PALETTE.red;
  const suit = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.85, metalness: 0.1 });
  const vest = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.7, metalness: 0.15 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9976b, roughness: 0.8, metalness: 0 });
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), suit);
  torso.position.y = 1.12;
  const vestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.4, 0.34), vest);
  vestMesh.position.y = 1.16;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
  head.position.y = 1.62;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.32), vest);
  visor.position.y = 1.66;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.78, 0.26), suit);
  legs.position.y = 0.39;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), suit);
  gun.position.set(0.22, 1.28, -0.25);
  g.add(torso, vestMesh, head, visor, legs, gun);
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  return { group: g, torso, head };
}

export function createBots(scene, world, combat, random) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 40;
  const tmpDir = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();
  const bots = [];
  const probe = new THREE.Box3();

  function overlaps(x, y, z) {
    probe.min.set(x - 0.34, y + 0.04, z - 0.34);
    probe.max.set(x + 0.34, y + 1.66, z + 0.34);
    for (const c of world.colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }

  function spawnBot(name, team, x, z, yaw) {
    const { group, torso, head } = buildBody(team);
    group.position.set(x, 0, z);
    scene.add(group);
    torso.userData = { bot: null, part: 'body' };
    head.userData = { bot: null, part: 'head' };
    const bot = {
      name, team, group, hp: BOT_HP, alive: true,
      pos: group.position, yaw, speed: BOT_SPEED,
      state: team === 'them' ? 'hold' : 'patrol',
      waypoint: null, holdTimer: 2 + random() * 4, react: 0,
      burstLeft: 0, burstTimer: 0, shootTimer: 0,
      target: null, lastSeen: null, investigate: null,
      thinkTimer: random() * 0.2, hitFlash: 0,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    bot.hitMeshes = [torso, head];
    bots.push(bot);
    return bot;
  }

  function nearestWaypoint(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const w of WAYPOINTS) {
      const d = Math.hypot(w.x - x, w.z - z);
      if (d < bestD) { bestD = d; best = w; }
    }
    return best;
  }

  function pickWaypoint(bot) {
    const near = nearestWaypoint(bot.pos.x, bot.pos.z, 14);
    const candidates = WAYPOINTS.filter((w) => {
      const d = Math.hypot(w.x - bot.pos.x, w.z - bot.pos.z);
      return d > 3 && d < 16;
    });
    if (!candidates.length) return near;
    return candidates[Math.floor(random() * candidates.length)];
  }

  // Line of sight: true when no world box blocks the segment eye -> point.
  function hasLOS(from, to) {
    tmpDir.copy(to).sub(from);
    const dist = tmpDir.length();
    if (dist < 0.01) return true;
    tmpDir.normalize();
    raycaster.set(from, tmpDir);
    raycaster.far = dist;
    return raycaster.intersectObjects(world.shootables, false).length === 0;
  }

  function canSee(bot, enemyPos) {
    tmpPos.copy(enemyPos);
    tmpPos.y = 1.4;
    const eye = tmpDir.copy(bot.pos);
    eye.y = 1.55;
    const dx = tmpPos.x - bot.pos.x;
    const dz = tmpPos.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > VISION_RANGE) return false;
    const toTarget = Math.atan2(dx, dz);
    let diff = Math.abs(toTarget - Math.atan2(-Math.sin(bot.yaw), -Math.cos(bot.yaw)));
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (dist > 4 && diff > VISION_HALF_FOV) return false;
    return hasLOS(eye, tmpPos);
  }

  function moveToward(bot, tx, tz, dt) {
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.3) return true;
    const step = Math.min(dist, bot.speed * dt);
    const ox = bot.pos.x;
    const oz = bot.pos.z;
    const nx = bot.pos.x + (dx / dist) * step;
    const nz = bot.pos.z + (dz / dist) * step;
    bot.yaw = Math.atan2(-(dx / dist), -(dz / dist));
    if (!overlaps(nx, bot.pos.y, bot.pos.z)) bot.pos.x = nx;
    if (!overlaps(bot.pos.x, bot.pos.y, nz)) bot.pos.z = nz;
    // Anti-stuck: a wall the straight line cannot pass gives up after ~1.2 s, so the
    // bot picks another waypoint instead of pushing the wall forever.
    const moved = Math.hypot(bot.pos.x - ox, bot.pos.z - oz);
    bot.stuck = moved < step * 0.2 ? (bot.stuck || 0) + dt : 0;
    if (bot.stuck > 1.2) { bot.stuck = 0; return true; }
    return dist < 0.6;
  }

  // One bot's brain tick (10 Hz). `foes` are the living enemies with positions,
  // `playerPos` is the player's position (a foe entry when the player is an enemy).
  function think(bot, foes, dt) {
    bot.thinkTimer -= dt;
    if (bot.thinkTimer > 0) return;
    bot.thinkTimer = 0.1;
    // Acquire a visible foe.
    let seen = null;
    for (const foe of foes) {
      if (!foe.alive) continue;
      if (canSee(bot, foe.pos)) { seen = foe; break; }
    }
    if (seen) {
      if (bot.target !== seen) { bot.react = REACT_TIME; bot.target = seen; }
      bot.lastSeen = { x: seen.pos.x, z: seen.pos.z };
      bot.state = 'engage';
      bot.investigate = null;
    } else if (bot.target) {
      bot.target = null;
      if (bot.lastSeen) {
        bot.investigate = bot.lastSeen;
        bot.lastSeen = null;
        bot.state = 'investigate';
      } else bot.state = bot.team === 'them' ? 'hold' : 'patrol';
    }
    if (bot.state === 'hold') {
      bot.holdTimer -= 0.1;
      if (bot.holdTimer <= 0) {
        bot.waypoint = pickWaypoint(bot);
        bot.state = 'patrol';
      }
    } else if (bot.state === 'patrol' && !bot.waypoint) {
      bot.waypoint = pickWaypoint(bot);
    }
  }

  function stepBot(bot, foes, dt, onBotShot) {
    if (!bot.alive) return;
    think(bot, foes, dt);
    if (bot.state === 'engage' && bot.target) {
      // Face the target, stand and shoot in bursts after the reaction delay.
      const dx = bot.target.pos.x - bot.pos.x;
      const dz = bot.target.pos.z - bot.pos.z;
      bot.yaw = Math.atan2(-dx, -dz);
      bot.react -= dt;
      if (bot.react <= 0) {
        bot.shootTimer -= dt;
        if (bot.shootTimer <= 0 && bot.burstLeft <= 0) {
          bot.burstLeft = BURST;
          bot.shootTimer = 0.12;
        }
        if (bot.burstLeft > 0) {
          bot.shootTimer -= dt;
          if (bot.shootTimer <= 0) {
            bot.shootTimer = 0.12;
            bot.burstLeft -= 1;
            onBotShot(bot, bot.target);
            if (bot.burstLeft === 0) bot.shootTimer = BURST_GAP;
          }
        }
      }
    } else if (bot.state === 'investigate' && bot.investigate) {
      if (moveToward(bot, bot.investigate.x, bot.investigate.z, dt)) {
        bot.investigate = null;
        bot.state = bot.team === 'them' ? 'hold' : 'patrol';
        bot.holdTimer = 2 + random() * 3;
      }
    } else if (bot.state === 'patrol' && bot.waypoint) {
      if (moveToward(bot, bot.waypoint.x, bot.waypoint.z, dt)) {
        bot.waypoint = null;
        bot.holdTimer = 1.5 + random() * 3;
        bot.state = 'hold';
      }
    }
    bot.group.position.copy(bot.pos);
    bot.group.rotation.y = bot.yaw;
    if (bot.hitFlash > 0) {
      bot.hitFlash -= dt;
      bot.group.traverse((m) => { if (m.isMesh) m.material.emissive?.setHex?.(0); });
    }
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    bot.hp -= amount;
    bot.hitFlash = 0.12;
    if (bot.hp <= 0) {
      bot.alive = false;
      bot.group.visible = false;
      return true;
    }
    return false;
  }

  function reset(spawns) {
    for (const bot of bots) scene.remove(bot.group);
    bots.length = 0;
    for (const s of spawns.allies) spawnBot(s.name, 'us', s.x, s.z, s.yaw);
    for (const s of spawns.enemies) spawnBot(s.name, 'them', s.x, s.z, s.yaw);
  }

  function noise(x, z, radius) {
    for (const bot of bots) {
      if (!bot.alive || bot.state === 'engage') continue;
      const d = Math.hypot(bot.pos.x - x, bot.pos.z - z);
      if (d < radius) {
        bot.investigate = { x, z };
        bot.state = 'investigate';
        bot.target = null;
      }
    }
  }

  return {
    bots,
    spawnBot,
    reset,
    noise,
    damage,
    hasLOS,
    canSee,
    step(bot, foes, dt, onBotShot) { stepBot(bot, foes, dt, onBotShot); },
    living(team) { return bots.filter((b) => b.alive && b.team === team); },
    allHitMeshes() {
      const out = [];
      for (const b of bots) if (b.alive) out.push(...b.hitMeshes);
      return out;
    },
  };
}
