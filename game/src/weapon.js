// BREACHLINE — weapons. Three guns plus one grenade, each with its own numbers so the
// buy menu is a real choice: rifle (accurate, pricey), SMG (fast, close), pistol
// (free sidearm). Spread grows with movement speed and with sustained fire, and recoil
// kicks the view up, so stopping to aim pays. The grenade is a thrown, timed explosive.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'VK-9 Rifle', price: 2700, mag: 30, reserve: 90, gap: 0.105,
    reload: 2.1, damage: 34, headMult: 2.9, spreadStill: 0.002, spreadMove: 0.03,
    recoil: 0.011, auto: true, range: 90,
  },
  smg: {
    id: 'smg', name: 'Rook-9 SMG', price: 1500, mag: 32, reserve: 96, gap: 0.075,
    reload: 1.7, damage: 22, headMult: 2.6, spreadStill: 0.006, spreadMove: 0.042,
    recoil: 0.007, auto: true, range: 55,
  },
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, mag: 12, reserve: 36, gap: 0.16,
    reload: 1.4, damage: 30, headMult: 3.0, spreadStill: 0.003, spreadMove: 0.02,
    recoil: 0.009, auto: false, range: 45,
  },
};

const GRENADE = { name: 'Frag Grenade', price: 300, fuse: 1.6, radius: 7, damage: 110 };

function buildModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });
  const g = new THREE.Group();
  const add = (w, h, d, x, y, z, m) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || body);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  if (def.id === 'rifle') {
    add(0.09, 0.1, 0.42, 0, 0, 0);
    add(0.045, 0.045, 0.42, 0, 0.025, -0.4, grip);
    add(0.075, 0.08, 0.22, 0, -0.02, 0.3, grip);
    add(0.02, 0.06, 0.1, 0, 0.07, -0.1, accent);
    add(0.05, 0.09, 0.08, 0, -0.08, 0.08, grip);
  } else if (def.id === 'smg') {
    add(0.08, 0.09, 0.3, 0, 0, 0);
    add(0.04, 0.04, 0.3, 0, 0.02, -0.28, grip);
    add(0.06, 0.07, 0.16, 0, -0.02, 0.2, grip);
    add(0.03, 0.12, 0.05, 0, -0.09, -0.05, grip);
    add(0.02, 0.05, 0.08, 0, 0.06, -0.05, accent);
  } else {
    add(0.06, 0.09, 0.22, 0, 0, -0.02);
    add(0.05, 0.12, 0.06, 0, -0.09, 0.06, grip);
    add(0.02, 0.03, 0.1, 0, 0.055, -0.08, accent);
  }
  g.position.set(0.25, -0.23, -0.6);
  g.scale.setScalar(def.id === 'pistol' ? 0.62 : 0.8);
  return g;
}

export function createWeapons(camera) {
  const models = {};
  for (const def of Object.values(WEAPONS)) {
    const m = buildModel(def);
    m.visible = false;
    camera.add(m);
    models[def.id] = m;
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.11, 0.11),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0, 0.04, -0.45);
  flash.visible = false;
  models.pistol.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const owned = { pistol: { mag: 12, reserve: 36 } };
  let current = 'pistol';
  models.pistol.visible = true;
  const state = { cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, heat: 0, grenades: 0 };

  function def() { return WEAPONS[current]; }
  function ammo() { return owned[current]; }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.heat = Math.max(0, state.heat - dt * 0.9);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[current];
    model.position.z = -0.6 + state.kick;
    model.rotation.x = state.kick * 2.2;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const a = ammo();
        const take = Math.min(def().mag - a.mag, a.reserve);
        a.mag += take;
        a.reserve -= take;
      }
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 8;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
  }

  return {
    state,
    def,
    ammo,
    current() { return current; },
    owned() { return owned; },
    grenadeDef: GRENADE,
    step,
    ready() {
      return ammo().mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = 0.06;
      state.kick = 0.055;
      state.heat = Math.min(1, state.heat + 0.14);
    },
    takeRound() {
      if (ammo().mag <= 0) return false;
      ammo().mag -= 1;
      return true;
    },
    reload() {
      const a = ammo();
      if (state.reloadLeft > 0 || a.mag === def().mag || a.reserve === 0) return false;
      state.reloadLeft = def().reload;
      return true;
    },
    spread(speed) {
      const d = def();
      const move = Math.min(1, speed / 5.2);
      return d.spreadStill + move * d.spreadMove + state.heat * 0.012;
    },
    switchTo(id) {
      if (!owned[id] || id === current) return false;
      models[current].visible = false;
      current = id;
      models[current].visible = true;
      models[current].add(flash);
      state.reloadLeft = 0;
      state.cooldown = Math.max(state.cooldown, 0.25);
      return true;
    },
    buy(id) {
      if (owned[id]) return false;
      owned[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      return true;
    },
    buyGrenade() {
      state.grenades += 1;
      return true;
    },
    useGrenade() {
      if (state.grenades <= 0) return false;
      state.grenades -= 1;
      return true;
    },
    resetRound(keepWeapons) {
      if (!keepWeapons) {
        for (const id of Object.keys(owned)) if (id !== 'pistol') delete owned[id];
        owned.pistol = { mag: 12, reserve: 36 };
        state.grenades = 0;
        models[current].visible = false;
        current = 'pistol';
        models.pistol.visible = true;
        models.pistol.add(flash);
      } else {
        for (const id of Object.keys(owned)) {
          owned[id].mag = WEAPONS[id].mag;
          owned[id].reserve = WEAPONS[id].reserve;
        }
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.heat = 0;
    },
  };
}
