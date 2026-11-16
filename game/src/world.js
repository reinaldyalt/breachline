// BREACHLINE — Yard 7, an original dusk freight yard. Two bomb sites (A: north-west
// warehouse, B: south-east container yard), three lanes (west, mid, east), crates and
// containers for cover, and a waypoint graph the bots patrol. Every box is a collider
// and a bullet stop. Coordinates: x east, z south; player spawns south, bots north.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WALL_H = 4.4;

// Waypoint graph: nodes the bots walk between. A bot picks any node within reach and
// walks straight; nodes sit in lanes and sites so straight lines never cross a wall.
export const WAYPOINTS = [
  { id: 0, x: -16, z: -9 },
  { id: 1, x: -10, z: -9 },
  { id: 2, x: -16, z: -2 },
  { id: 3, x: -16, z: 6 },
  { id: 4, x: -8, z: 0 },
  { id: 5, x: 0, z: -8 },
  { id: 6, x: 0, z: 0 },
  { id: 7, x: 0, z: 8 },
  { id: 8, x: 8, z: -6 },
  { id: 9, x: 12, z: 0 },
  { id: 10, x: 12, z: 9 },
  { id: 11, x: 16, z: 9 },
  { id: 12, x: -4, z: -12 },
  { id: 13, x: 6, z: 12 },
  { id: 14, x: -12, z: 11 },
];

export const SPAWNS = {
  player: { x: -12, z: 11, yaw: 0 },
  allies: [
    { x: -15, z: 11, yaw: 0 },
    { x: -9, z: 12, yaw: 0 },
  ],
  enemies: [
    { x: -16, z: -9, yaw: Math.PI },
    { x: 12, z: 9, yaw: Math.PI },
    { x: 0, z: -8, yaw: Math.PI },
    { x: -4, z: -12, yaw: Math.PI },
  ],
};

export const SITES = {
  A: { minX: -19, maxX: -7, minZ: -13.5, maxZ: -5, label: 'A', color: PALETTE.siteA },
  B: { minX: 7, maxX: 19, minZ: 5, maxZ: 13.5, label: 'B', color: PALETTE.siteB },
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const rust = new THREE.MeshStandardMaterial({ color: 0x8a5a2e, roughness: 0.85, metalness: 0.15 });
  const slate = new THREE.MeshStandardMaterial({ color: 0x4a5a66, roughness: 0.85, metalness: 0.15 });
  const olive = new THREE.MeshStandardMaterial({ color: 0x5a5a3a, roughness: 0.9, metalness: 0.1 });

  const colliders = [];
  const shootables = [];
  const boxes = [];

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    }
    shootables.push(mesh);
    return mesh;
  }

  // Floor: no collider (the player's y < 0 clamp is the ground) and no minimap box.
  box(40.4, 0.4, 28.4, 0, -0.2, 0, materials.canvas, false);
  box(0.4, WALL_H, 28.4, -20.2, WALL_H / 2, 0, materials.surface);
  box(0.4, WALL_H, 28.4, 20.2, WALL_H / 2, 0, materials.surface);
  box(40.4, WALL_H, 0.4, 0, WALL_H / 2, -14.2, materials.surface);
  box(40.4, WALL_H, 0.4, 0, WALL_H / 2, 14.2, materials.surface);

  // Site A warehouse: north-west room, a 6 m gap in its south wall and a 3 m door
  // in its east wall.
  box(3, WALL_H, 0.4, -18.5, WALL_H / 2, -5.2, materials.surface); // south wall west
  box(4, WALL_H, 0.4, -9, WALL_H / 2, -5.2, materials.surface); // south wall east
  box(0.4, WALL_H, 3, -6.8, WALL_H / 2, -12.5, materials.surface); // east wall north
  box(0.4, WALL_H, 3, -6.8, WALL_H / 2, -6.5, materials.surface); // east wall south
  box(12, 0.3, 0.5, -13, 4.0, -8, materials.hairline, false);
  box(12, 0.3, 0.5, -13, 4.0, -12, materials.hairline, false);

  // Mid: central pillar, crates, a long low wall splitting the lane.
  box(1.4, 3.4, 1.4, 0, 1.7, -2, materials.hairline);
  box(2.2, 1.1, 1.2, -3.2, 0.55, 2.5, materials.hairline);
  box(1.2, 1.1, 2.2, 3.4, 0.55, 1.5, materials.hairline);
  box(4.6, 0.9, 0.5, 0, 0.45, 5.6, materials.hairline);
  box(1.6, 0.7, 1.6, -6.5, 0.35, -6, materials.hairline);
  box(1.6, 0.7, 1.6, 6.5, 0.35, -6.5, materials.hairline);

  // Containers: east lane stack and site B yard (tall cover, real sightline blockers).
  box(6, 2.6, 2.6, 12, 1.3, -6, rust);
  box(6, 2.6, 2.6, 12, 1.3, -2.6, slate);
  box(2.6, 2.6, 6, 16.5, 1.3, 6, olive);
  box(2.6, 2.6, 6, 16.5, 1.3, 11.5, rust);
  box(6, 2.6, 2.6, 9, 1.3, 12.4, slate);
  // West lane crates and a stacked pair.
  box(1.8, 1.1, 1.8, -16, 0.55, 2, materials.hairline);
  box(1.8, 1.1, 1.8, -16, 0.55, 4.2, materials.hairline);
  box(1.2, 1.1, 1.2, -16, 1.65, 3.1, materials.hairline);
  box(2.4, 1.1, 1.2, -10, 0.55, 8, materials.hairline);
  box(1.2, 1.1, 2.4, 5, 0.55, 9, materials.hairline);
  // North catwalk crates.
  box(2.0, 1.1, 1.2, -4, 0.55, -11.5, materials.hairline);
  box(2.0, 1.1, 1.2, 4, 0.55, -11.5, materials.hairline);

  // Site pads: flat coloured ground marking each bomb site, plus a light beacon.
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(s.maxX - s.minX, 0.06, s.maxZ - s.minZ),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(s.color), roughness: 0.9, transparent: true, opacity: 0.16 }),
    );
    pad.position.set((s.minX + s.maxX) / 2, 0.03, (s.minZ + s.maxZ) / 2);
    pad.receiveShadow = true;
    group.add(pad);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 6, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(s.color), transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.set((s.minX + s.maxX) / 2, 3, (s.minZ + s.maxZ) / 2);
    group.add(beam);
  }

  // Floodlight poles at mid and both sites.
  for (const [x, z] of [[-2, -12], [14, 2], [-14, 12]]) {
    box(0.25, 5.2, 0.25, x, 2.6, z, materials.hairline, false);
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 22, 18, 1.8);
    lamp.position.set(x, 5, z);
    scene.add(lamp);
  }

  scene.background = new THREE.Color(PALETTE.canvas);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);
  scene.add(new THREE.HemisphereLight(new THREE.Color(0x8a7a5e), new THREE.Color(PALETTE.canvas), 1.25));
  const sun = new THREE.DirectionalLight(new THREE.Color(0xffc27a), 2.8);
  sun.position.set(-18, 16, 6);
  sun.target.position.set(4, 0, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(0x6a7a8a), 0.5);
  fill.position.set(14, 10, -10);
  scene.add(fill);

  return { colliders, shootables, boxes, group };
}

export function pointInSite(x, z) {
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return key;
  }
  return null;
}
