// BREACHLINE — combat effects and hit resolution. Tracers and impact sparks come from
// fixed pools (no allocation in the hot loop): a shot reuses the next tracer line and
// the next spark burst. Hits are resolved against bot hitboxes: head x2.9-ish, body x1,
// with damage falloff over range. Grenades fly on a fixed-step arc and explode in AoE.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 24;
const SPARKS = 10;
const SPARK_POINTS = 8;

export function createCombat(scene) {
  const raycaster = new THREE.Raycaster();
  const dir = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();

  // Tracer pool: thin additive lines from muzzle to impact.
  const tracers = [];
  for (let i = 0; i < TRACERS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85 }));
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerNext = 0;

  // Spark pool: small point clouds that burst and fade.
  const sparks = [];
  for (let i = 0; i < SPARKS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_POINTS * 3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.accent), size: 0.09, transparent: true, opacity: 0 }));
    pts.frustumCulled = false;
    scene.add(pts);
    sparks.push({ pts, life: 0, vel: new Float32Array(SPARK_POINTS * 3) });
  }
  let sparkNext = 0;

  const grenades = []; // {mesh, vel, fuse, live}
  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x2e4d2a, roughness: 0.6, metalness: 0.4 });

  function showTracer(from, to) {
    const t = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % TRACERS;
    const pos = t.line.geometry.attributes.position.array;
    pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
    pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.visible = true;
    t.life = 0.07;
  }

  function showSparks(at, normal, color) {
    const s = sparks[sparkNext];
    sparkNext = (sparkNext + 1) % SPARKS;
    const pos = s.pts.geometry.attributes.position.array;
    for (let i = 0; i < SPARK_POINTS; i++) {
      pos[i * 3] = at.x; pos[i * 3 + 1] = at.y; pos[i * 3 + 2] = at.z;
      s.vel[i * 3] = normal.x * 2 + (Math.random() - 0.5) * 3;
      s.vel[i * 3 + 1] = normal.y * 2 + Math.random() * 2.5;
      s.vel[i * 3 + 2] = normal.z * 2 + (Math.random() - 0.5) * 3;
    }
    s.pts.geometry.attributes.position.needsUpdate = true;
    s.pts.material.color.set(color);
    s.pts.material.opacity = 1;
    s.life = 0.35;
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.85;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    for (const s of sparks) {
      if (s.life > 0) {
        s.life -= dt;
        const pos = s.pts.geometry.attributes.position.array;
        for (let i = 0; i < SPARK_POINTS; i++) {
          pos[i * 3] += s.vel[i * 3] * dt;
          pos[i * 3 + 1] += s.vel[i * 3 + 1] * dt;
          pos[i * 3 + 2] += s.vel[i * 3 + 2] * dt;
          s.vel[i * 3 + 1] -= 9 * dt;
        }
        s.pts.geometry.attributes.position.needsUpdate = true;
        s.pts.material.opacity = Math.max(0, s.life / 0.35);
      }
    }
    // Grenade arcs: fixed gravity, bounce once, explode on fuse.
    for (let i = grenades.length - 1; i >= 0; i--) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      if (g.mesh.position.y < 0.09) {
        g.mesh.position.y = 0.09;
        g.vel.y = Math.abs(g.vel.y) * 0.35;
        g.vel.x *= 0.6;
        g.vel.z *= 0.6;
      }
      if (g.fuse <= 0) {
        const p = g.mesh.position.clone();
        scene.remove(g.mesh);
        grenades.splice(i, 1);
        g.onExplode(p);
      }
    }
  }

  // Fire one hitscan shot. Returns {hit, part, point, distance} or null on a wall hit.
  function shoot(origin, direction, spread, range, shootables, targets, random) {
    dir.copy(direction);
    dir.x += (random() * 2 - 1) * spread;
    dir.y += (random() * 2 - 1) * spread;
    dir.z += (random() * 2 - 1) * spread;
    dir.normalize();
    raycaster.set(origin, dir);
    raycaster.far = range;
    const hits = raycaster.intersectObjects(shootables, false);
    const end = tmp.copy(dir).multiplyScalar(range).add(origin);
    if (!hits.length) {
      showTracer(origin, end);
      return { hit: false, point: end, distance: range };
    }
    const h = hits[0];
    showTracer(origin, h.point);
    const ud = h.object.userData;
    if (ud && ud.bot) {
      return { hit: true, bot: ud.bot, part: ud.part, point: h.point, distance: h.distance };
    }
    tmp2.copy(h.face ? h.face.normal : dir).multiplyScalar(-1);
    showSparks(h.point, tmp2, PALETTE.accent);
    return { hit: false, point: h.point, distance: h.distance, wall: true };
  }

  function throwGrenade(origin, direction, onExplode) {
    const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    mesh.position.copy(origin);
    scene.add(mesh);
    const vel = direction.clone().multiplyScalar(11);
    vel.y += 3.5;
    grenades.push({ mesh, vel, fuse: 1.6, onExplode });
  }

  function clearGrenades() {
    for (const g of grenades) scene.remove(g.mesh);
    grenades.length = 0;
  }

  return { step, shoot, throwGrenade, clearGrenades, showSparks, showTracer };
}
