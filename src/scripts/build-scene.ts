/**
 * The 3D "how a building comes together" scene.
 *
 * A single progress value from 0 to 1 drives the whole build in four stages (see
 * src/data/build-stages.ts). The first two are procedural: the concrete frame, the services and
 * the tower crane are instanced boxes made here. The last two, the envelope and the finish, are
 * an authored model (see build-model.ts). Both are built to src/data/build-dimensions.json.
 *
 * Nothing here moves on its own. A frame is drawn only when progress, the pointer or the
 * size changes, so a settled scene costs no GPU time.
 *
 * This module is loaded on demand (it pulls in three.js), never on first paint.
 */

import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  CircleGeometry,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  Group,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  ShadowMaterial,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { BufferGeometry, Material } from 'three';

import dimensions from '../data/build-dimensions.json';
import { BUILD_END, STAGE_STARTS } from '../data/build-stages';
import { loadBuildModel } from './build-model';

export interface SceneColors {
  accent: string;
  background: string;
}

export interface BuildSceneOptions {
  colors: SceneColors;

  /** The contents of src/assets/models/build-envelope.glb. */
  model: ArrayBuffer;

  /** Aborting this while the model is being read stops the scene from starting. */
  signal?: AbortSignal;

  /** Scroll progress to start from, 0 to 1. */
  progress?: number;

  /** Called with the progress the model is actually showing, which trails the target slightly. */
  onProgress?: (progress: number) => void;
}

export interface BuildScene {
  /** Scroll progress through the section, from 0 to 1. */
  setProgress(progress: number): void;

  /** Pointer position over the scene, each axis from -1 to 1. */
  setPointer(x: number, y: number): void;

  /** Stop drawing while the scene is off screen. */
  setActive(active: boolean): void;

  resize(): void;
  dispose(): void;
}

/* Dimensions, in metres. The authored model is built to the same numbers, so it closes around the frame. */

const FLOORS = dimensions.floors;
const FLOOR_HEIGHT = dimensions.floorHeight;
const SLAB = dimensions.slab;
const BASE = dimensions.base;
const PLOT = dimensions.plot;
const TOWER_HEIGHT = FLOORS * FLOOR_HEIGHT;

const COLUMN_XS = [-6, -2, 2, 6];
const COLUMN_ZS = [-4, 0, 4];

/** Glazing planes of the tower, measured from its centre. */
const HALF_WIDTH = dimensions.halfWidth;
const HALF_DEPTH = dimensions.halfDepth;

const WING_X = dimensions.wingX;
const WING_WIDTH = dimensions.wingWidth;
const WING_DEPTH = dimensions.wingDepth;
const WING_HEIGHT = dimensions.wingHeight;

const [STRUCTURE, SERVICES, ENVELOPE, FINISH] = STAGE_STARTS;

/** The core is the tallest thing on site while the frame goes up, so the crane's load is kept above it. */
const CORE_START = STRUCTURE + 0.03;
const CORE_DURATION = 0.24;

/** When the parked crane starts to be lowered, and how long that takes. */
const CRANE_DOWN = ENVELOPE + 0.16;
const CRANE_DOWN_DURATION = 0.09;

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
const ramp = (progress: number, start: number, end: number) => clamp01((progress - start) / (end - start));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const smooth = (t: number) => t * t * (3 - 2 * t);

/** A box that grows from one end along an axis, or settles from just above. */
interface Piece {
  position: Vector3;
  size: Vector3;
  start: number;
  duration: number;
  motion: 'grow-x' | 'grow-y' | 'grow-z' | 'drop';
}

/** One InstancedMesh of unit boxes, each animated by its own Piece. */
function createPieces(pieces: Piece[], material: Material, shadows = true) {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, pieces.length);
  const dummy = new Object3D();

  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  mesh.frustumCulled = false;

  const first = Math.min(...pieces.map((piece) => piece.start));
  const last = Math.max(...pieces.map((piece) => piece.start + piece.duration));

  let settled: 'before' | 'after' | undefined;

  const update = (progress: number) => {
    const phase = progress <= first ? 'before' : progress >= last ? 'after' : undefined;

    // A set that has not started, or has finished, is written once and then left alone.
    if (phase && phase === settled) return;

    settled = phase;
    mesh.visible = phase !== 'before';

    pieces.forEach((piece, index) => {
      const raw = ramp(progress, piece.start, piece.start + piece.duration);
      const eased = easeOut(raw);

      dummy.position.copy(piece.position);
      dummy.scale.copy(piece.size);

      if (raw <= 0) {
        dummy.scale.setScalar(0);
      } else if (piece.motion === 'grow-y') {
        dummy.scale.y = piece.size.y * eased;
        dummy.position.y = piece.position.y - piece.size.y / 2 + (piece.size.y * eased) / 2;
      } else if (piece.motion === 'grow-x') {
        dummy.scale.x = piece.size.x * eased;
        dummy.position.x = piece.position.x - piece.size.x / 2 + (piece.size.x * eased) / 2;
      } else if (piece.motion === 'grow-z') {
        dummy.scale.z = piece.size.z * eased;
        dummy.position.z = piece.position.z - piece.size.z / 2 + (piece.size.z * eased) / 2;
      } else if (piece.motion === 'drop') {
        dummy.position.y = piece.position.y + (1 - eased) * 1.2;
      }

      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
  };

  return { mesh, update };
}

/** A set of thin struts between pairs of points, drawn as one InstancedMesh. Used for the crane lattice. */
function createStruts(struts: [Vector3, Vector3][], thickness: number, material: Material) {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, struts.length);
  const dummy = new Object3D();
  const up = new Vector3(0, 1, 0);
  const direction = new Vector3();

  struts.forEach(([from, to], index) => {
    direction.subVectors(to, from);

    dummy.position.addVectors(from, to).multiplyScalar(0.5);
    dummy.scale.set(thickness, direction.length(), thickness);
    dummy.quaternion.setFromUnitVectors(up, direction.normalize());
    dummy.updateMatrix();

    mesh.setMatrixAt(index, dummy.matrix);
  });

  mesh.castShadow = true;

  return mesh;
}

/**
 * Reflections come from a plain outdoor sky: blue overhead, pale at the horizon, with a broad
 * glow where the sun is. Broad shapes like these read as daylight on glass and gold.
 */
function createSkyEnvironment(renderer: WebGLRenderer, sunDirection: Vector3) {
  const geometry = new SphereGeometry(60, 48, 24);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);

  const zenith = new Color(0x6f8fb8);
  const horizon = new Color(0xf3e8da);
  const earth = new Color(0x34373c);
  const glow = new Color(0xfff2de);

  const direction = new Vector3();
  const colour = new Color();

  for (let index = 0; index < position.count; index += 1) {
    direction.fromBufferAttribute(position, index).normalize();

    if (direction.y >= 0) colour.copy(horizon).lerp(zenith, Math.pow(direction.y, 0.5));
    else colour.copy(horizon).lerp(earth, Math.min(-direction.y * 5, 1));

    const sun = Math.pow(Math.max(direction.dot(sunDirection), 0), 10);

    colour.lerp(glow, sun * 0.7).multiplyScalar(1 + sun * 2.5);
    colour.toArray(colors, index * 3);
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 3));

  const material = new MeshBasicMaterial({ vertexColors: true, side: BackSide });
  const sky = new Scene();

  sky.add(new Mesh(geometry, material));

  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(sky, 0.03);

  pmrem.dispose();
  geometry.dispose();
  material.dispose();

  return target;
}

/**
 * Camera positions through the build, eased between as the page scrolls: the whole site, with
 * headroom for the crane until it has started down, then in close on the wing while it is gilded,
 * and back out to the finished building.
 */
const SHOTS = [
  { at: STRUCTURE, azimuth: -0.44, elevation: 0.34, target: [1.5, 17.5, 0], halfHeight: 23, halfWidth: 23 },
  { at: SERVICES, azimuth: -0.3, elevation: 0.29, target: [1.5, 17, 0], halfHeight: 22.5, halfWidth: 22.5 },
  { at: ENVELOPE, azimuth: -0.16, elevation: 0.26, target: [2.5, 16.5, 0], halfHeight: 22, halfWidth: 22 },
  { at: CRANE_DOWN + 0.01, azimuth: -0.08, elevation: 0.24, target: [3, 16, 0], halfHeight: 21.5, halfWidth: 21.5 },
  { at: FINISH - 0.03, azimuth: -0.02, elevation: 0.23, target: [3.5, 14.5, 0], halfHeight: 20.5, halfWidth: 21 },
  { at: FINISH + 0.03, azimuth: 0.26, elevation: 0.2, target: [WING_X - 1.5, 6.6, 1], halfHeight: 9.5, halfWidth: 11.5 },
  { at: FINISH + 0.14, azimuth: 0.3, elevation: 0.19, target: [WING_X - 1.5, 6.8, 1], halfHeight: 9.5, halfWidth: 11.5 },
  { at: 1, azimuth: 0.14, elevation: 0.2, target: [4, 14, 0], halfHeight: 20.5, halfWidth: 20.5 },
];

export async function createBuildScene(canvas: HTMLCanvasElement, options: BuildSceneOptions): Promise<BuildScene> {
  const accent = new MeshStandardMaterial({ color: options.colors.accent, roughness: 0.5, metalness: 0.15 });

  // The model is read before anything touches the canvas, so a file that fails leaves nothing to clean up.
  const model = await loadBuildModel(options.model, {
    stages: { envelope: ENVELOPE, finish: FINISH },

    material(material) {
      // The canopy takes the site's accent colour, and glass leans on the sky for its reflections.
      if (material.name === 'accent') return accent;
      if (material.name === 'glass') material.envMapIntensity = 2.2;

      return material;
    },
  });

  options.signal?.throwIfAborted();

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });

  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.localClippingEnabled = true;

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  const background = new Color(options.colors.background);
  const camera = new PerspectiveCamera(30, 1, 1, 500);

  /* Light: one low, warm sun for the shadows, a faint sky fill, and the sky for reflections. */

  const sunPosition = new Vector3(34, 46, 30);
  const environment = createSkyEnvironment(renderer, sunPosition.clone().normalize());

  scene.environment = environment.texture;
  scene.environmentIntensity = 0.85;

  const sky = new HemisphereLight(0xdfe8f5, 0x16181c, 0.4);
  const sun = new DirectionalLight(0xffe4c8, 2.3);

  sun.position.copy(sunPosition);
  sun.target.position.set(3, 8, 0);
  sun.castShadow = true;

  // The shadow map is redrawn only when the build changes, not on every frame.
  sun.shadow.autoUpdate = false;
  sun.shadow.radius = 2;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;

  scene.add(sky, sun, sun.target);

  /* Materials */

  const groundMaterial = new ShadowMaterial({ opacity: 0.38 });
  const paving = new MeshStandardMaterial({ color: background.clone().lerp(new Color(0xffffff), 0.1), roughness: 0.92 });
  const kerb = new MeshStandardMaterial({ color: background.clone().lerp(new Color(0xffffff), 0.2), roughness: 0.9 });
  const concrete = new MeshStandardMaterial({ color: 0xcdc9c0, roughness: 0.94 });
  const plaster = new MeshStandardMaterial({ color: 0xf1eee7, roughness: 0.9 });
  const metal = new MeshStandardMaterial({ color: 0x30353c, roughness: 0.42, metalness: 0.7 });

  /* Ground and site: an unlit shadow catcher, with a paved plot on a kerb. */

  const ground = new Mesh(new CircleGeometry(240, 48), groundMaterial);

  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;

  const kerbPlate = new Mesh(new BoxGeometry(34.6, 0.14, 24.6), kerb);
  kerbPlate.position.set(4, 0.07, 0.6);
  kerbPlate.receiveShadow = true;

  const plot = new Mesh(new BoxGeometry(34, PLOT, 24), paving);
  plot.position.set(4, PLOT / 2, 0.6);
  plot.receiveShadow = true;

  scene.add(ground, kerbPlate, plot);

  /* Stage 1: structure. Foundations, then columns and slabs floor by floor, and the core. */

  const footing = (HALF_WIDTH + dimensions.footing) * 2;
  const footingDepth = (HALF_DEPTH + dimensions.footing) * 2;
  const wingFooting = dimensions.wingFooting * 2;

  const structure: Piece[] = [
    { position: new Vector3(0, 0.6, 0), size: new Vector3(footing, 0.6, footingDepth), start: STRUCTURE, duration: 0.04, motion: 'grow-y' },
    { position: new Vector3(WING_X, 0.6, 0), size: new Vector3(WING_WIDTH + wingFooting, 0.6, WING_DEPTH + wingFooting), start: STRUCTURE + 0.1, duration: 0.04, motion: 'grow-y' },
    { position: new Vector3(0, BASE + TOWER_HEIGHT / 2, -2.2), size: new Vector3(3.2, TOWER_HEIGHT, 2.6), start: CORE_START, duration: CORE_DURATION, motion: 'grow-y' },
  ];

  for (let floor = 0; floor < FLOORS; floor += 1) {
    const start = STRUCTURE + 0.03 + floor * 0.028;
    const columnHeight = FLOOR_HEIGHT - SLAB;

    for (const x of COLUMN_XS) {
      for (const z of COLUMN_ZS) {
        structure.push({
          position: new Vector3(x, BASE + floor * FLOOR_HEIGHT + columnHeight / 2, z),
          size: new Vector3(0.5, columnHeight, 0.5),
          start,
          duration: 0.03,
          motion: 'grow-y',
        });
      }
    }

    structure.push({
      position: new Vector3(0, BASE + (floor + 1) * FLOOR_HEIGHT - SLAB / 2, 0),
      size: new Vector3(13.4, SLAB, 9.4),
      start: start + 0.02,
      duration: 0.03,
      motion: 'drop',
    });
  }

  const wingSlabLeft = HALF_WIDTH + 0.03;
  const wingSlabRight = WING_X + (WING_WIDTH - 0.5) / 2;

  for (let level = 0; level < 2; level += 1) {
    const start = STRUCTURE + 0.13 + level * 0.05;
    const columnHeight = WING_HEIGHT / 2 - SLAB;

    // The wing's columns stand behind the solid wall between its arches, so none shows through an opening.
    for (const x of [WING_X - 5, WING_X - 1.8, WING_X + 1.8, WING_X + 5]) {
      for (const z of [-3.6, 3.6]) {
        structure.push({
          position: new Vector3(x, BASE + (level * WING_HEIGHT) / 2 + columnHeight / 2, z),
          size: new Vector3(0.45, columnHeight, 0.45),
          start,
          duration: 0.03,
          motion: 'grow-y',
        });
      }
    }

    structure.push({
      position: new Vector3((wingSlabLeft + wingSlabRight) / 2, BASE + ((level + 1) * WING_HEIGHT) / 2 - SLAB / 2, 0),
      size: new Vector3(wingSlabRight - wingSlabLeft, SLAB, WING_DEPTH - 0.5),
      start: start + 0.02,
      duration: 0.03,
      motion: 'drop',
    });
  }

  /* Stage 2: services and fit-out. Risers climb the core, ducts run each floor, partitions go up. */

  const services: Piece[] = [];
  const partitions: Piece[] = [];

  [-1.1, 0, 1.1].forEach((x, index) => {
    services.push({
      position: new Vector3(x, BASE + (TOWER_HEIGHT - 0.6) / 2, -0.65),
      size: new Vector3(0.34, TOWER_HEIGHT - 0.6, 0.34),
      start: SERVICES + 0.01 + index * 0.01,
      duration: 0.12,
      motion: 'grow-y',
    });
  });

  for (let floor = 0; floor < FLOORS; floor += 1) {
    const ceiling = BASE + (floor + 1) * FLOOR_HEIGHT - SLAB - 0.32;
    const start = SERVICES + 0.04 + floor * 0.017;
    const wallHeight = FLOOR_HEIGHT - SLAB - 0.08;
    const wallY = BASE + floor * FLOOR_HEIGHT + wallHeight / 2;

    services.push(
      { position: new Vector3(0, ceiling, 1.4), size: new Vector3(12.4, 0.3, 0.5), start, duration: 0.05, motion: 'grow-x' },
      { position: new Vector3(3.2, ceiling, 0.4), size: new Vector3(0.4, 0.26, 7.6), start: start + 0.02, duration: 0.05, motion: 'grow-z' },
    );

    partitions.push(
      { position: new Vector3(-4, wallY, 0.4), size: new Vector3(0.14, wallHeight, 7.4), start: start + 0.05, duration: 0.04, motion: 'grow-y' },
      { position: new Vector3(4.6, wallY, -1.2), size: new Vector3(0.14, wallHeight, 4.6), start: start + 0.06, duration: 0.04, motion: 'grow-y' },
      { position: new Vector3(0.3, wallY, 2.6), size: new Vector3(7.6, wallHeight, 0.14), start: start + 0.07, duration: 0.04, motion: 'grow-y' },
    );
  }

  const sets = [createPieces(structure, concrete), createPieces(services, accent), createPieces(partitions, plaster)];

  scene.add(...sets.map((set) => set.mesh));

  /* Stages 3 and 4: the envelope and the finish, from the authored model. */

  scene.add(model.object);

  /* Tower crane: a lattice mast and jib. It builds the frame, then is struck as the envelope closes. */

  const crane = new Group();
  const craneHeight = 31;
  const mastHalf = 0.6;

  crane.position.set(-11.5, PLOT, -7.5);

  const mastStruts: [Vector3, Vector3][] = [];
  const corners = [
    [-mastHalf, -mastHalf],
    [mastHalf, -mastHalf],
    [mastHalf, mastHalf],
    [-mastHalf, mastHalf],
  ];

  corners.forEach(([x, z]) => mastStruts.push([new Vector3(x, 0, z), new Vector3(x, craneHeight, z)]));

  for (let level = 0; level < craneHeight; level += 2) {
    corners.forEach(([x, z], index) => {
      const [nextX, nextZ] = corners[(index + 1) % 4];

      mastStruts.push([new Vector3(x, level, z), new Vector3(nextX, level, nextZ)]);
      mastStruts.push([new Vector3(x, level, z), new Vector3(nextX, Math.min(level + 2, craneHeight), nextZ)]);
    });
  }

  const slew = new Group();
  slew.position.y = craneHeight;

  const jibLength = 22;
  const jibStruts: [Vector3, Vector3][] = [
    [new Vector3(-6.4, 0, -0.45), new Vector3(jibLength, 0, -0.45)],
    [new Vector3(-6.4, 0, 0.45), new Vector3(jibLength, 0, 0.45)],
    [new Vector3(0, 0.95, 0), new Vector3(jibLength - 0.8, 0.95, 0)],
    [new Vector3(0, 0, 0), new Vector3(0, 4.4, 0)],
    [new Vector3(0, 4.4, 0), new Vector3(14, 0.95, 0)],
    [new Vector3(0, 4.4, 0), new Vector3(-5.6, 0, 0)],
  ];

  for (let x = 0; x < jibLength - 1.6; x += 1.6) {
    jibStruts.push(
      [new Vector3(x, 0, -0.45), new Vector3(x + 0.8, 0.95, 0)],
      [new Vector3(x, 0, 0.45), new Vector3(x + 0.8, 0.95, 0)],
      [new Vector3(x + 0.8, 0.95, 0), new Vector3(x + 1.6, 0, -0.45)],
      [new Vector3(x + 0.8, 0.95, 0), new Vector3(x + 1.6, 0, 0.45)],
      [new Vector3(x, 0, -0.45), new Vector3(x, 0, 0.45)],
    );
  }

  const mast = createStruts(mastStruts, 0.11, accent);
  const jib = createStruts(jibStruts, 0.09, accent);

  const counterweight = new Mesh(new BoxGeometry(2.2, 1.4, 1.3), concrete);
  counterweight.position.set(-5.4, -0.8, 0);

  const cab = new Mesh(new BoxGeometry(1.3, 1.3, 1.2), metal);
  cab.position.set(1.3, -0.75, 0.75);

  const trolley = new Mesh(new BoxGeometry(0.9, 0.22, 1.1), metal);
  const hoist = new Mesh(new BoxGeometry(0.05, 1, 0.05), metal);
  const load = new Mesh(new BoxGeometry(3, 0.26, 1.8), concrete);

  for (const part of [counterweight, cab, load]) part.castShadow = true;

  slew.add(jib, counterweight, cab, trolley, hoist, load);
  crane.add(mast, slew);
  scene.add(crane);

  // A positive turn about Y swings the jib toward -Z, so the heading to the tower is negative.
  const towardTower = Math.atan2(-7.5, 11.5);

  // Parked, the jib points out over open ground behind the site, and the counter-jib stops short of the tower.
  const parked = Math.atan2(0.95, -0.3);

  /* Shadows: fit the light's view to what can actually cast or catch one. */

  const fitShadow = (compact: boolean) => {
    const probe = new Object3D();
    const corner = new Vector3();

    probe.position.copy(sun.position);
    probe.lookAt(sun.target.position);
    probe.updateMatrixWorld();

    const toLight = probe.matrixWorld.clone().invert();
    const low = new Vector3(Infinity, Infinity, Infinity);
    const high = new Vector3(-Infinity, -Infinity, -Infinity);

    for (const x of [-22, 26]) {
      for (const y of [0, craneHeight + 6]) {
        for (const z of [-16, 16]) {
          corner.set(x, y, z).applyMatrix4(toLight);
          low.min(corner);
          high.max(corner);
        }
      }
    }

    // The probe looks along +Z; a camera looks along -Z, so left and right swap.
    sun.shadow.camera.left = -high.x;
    sun.shadow.camera.right = -low.x;
    sun.shadow.camera.bottom = low.y;
    sun.shadow.camera.top = high.y;
    sun.shadow.camera.near = Math.max(low.z - 5, 1);
    sun.shadow.camera.far = high.z + 5;
    sun.shadow.camera.updateProjectionMatrix();

    const size = compact ? 1024 : 2048;

    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.setScalar(size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }

    sun.shadow.needsUpdate = true;
  };

  /* State */

  const onProgress = options.onProgress;

  let target = clamp01(options.progress ?? 0);
  let current = -1;
  let pointerX = 0;
  let pointerY = 0;
  let driftX = 0;
  let driftY = 0;
  let shift = 0;
  let covered = 0;
  let active = true;
  let disposed = false;
  let frame = 0;
  let previous = 0;

  const lookAt = new Vector3();

  const applyProgress = (progress: number) => {
    // The last stretch of scroll holds the finished building.
    const built = Math.min(progress / BUILD_END, 1);

    for (const set of sets) set.update(built);

    model.update(built);

    // Crane: the mast climbs first. Once the frame is done it raises its hook, swings clear of
    // the building and parks, and only then is it lowered.
    const up = easeOut(ramp(built, STRUCTURE, STRUCTURE + 0.05));
    const park = smooth(ramp(built, ENVELOPE + 0.07, ENVELOPE + 0.15));
    const down = smooth(ramp(built, CRANE_DOWN, CRANE_DOWN + CRANE_DOWN_DURATION));

    const raised = Math.max(up * (1 - down), 0.001);
    const jibHeight = craneHeight * raised;

    crane.visible = up > 0 && down < 1;
    mast.scale.y = raised;
    slew.position.y = jibHeight;
    slew.visible = raised > 0.04;

    // While it works, the jib slews with the scroll and the load rides just above the highest floor built so far.
    const working = towardTower + Math.sin(built * 26) * 0.42;
    const frameTop = BASE + TOWER_HEIGHT * easeOut(ramp(built, CORE_START, CORE_START + CORE_DURATION));
    const clearance = Math.max(frameTop + 3.2, 9) + (Math.sin(built * 41) + 1) * 1.2;

    slew.rotation.y = MathUtils.lerp(working, parked, park);

    const reach = MathUtils.lerp(12.5 + Math.sin(built * 17) * 2.5, 6, park);
    const drop = MathUtils.lerp(Math.max(jibHeight - clearance, 1), 1, park);

    // The hook never hangs below the ground while the mast is short.
    const hanging = jibHeight - drop > 0.8;

    trolley.position.set(reach, -0.12, 0);

    hoist.visible = hanging;
    hoist.scale.y = drop;
    hoist.position.set(reach, -drop / 2, 0);

    load.visible = hanging;
    load.position.set(reach, -drop - 0.13, 0);

    sun.shadow.needsUpdate = true;
  };

  const placeCamera = (progress: number) => {
    const built = Math.min(progress / BUILD_END, 1);

    let index = 0;

    while (index < SHOTS.length - 2 && built >= SHOTS[index + 1].at) index += 1;

    const from = SHOTS[index];
    const to = SHOTS[index + 1];
    const blend = smooth(ramp(built, from.at, to.at));

    // Stand far enough back to hold the shot in the room left beside the copy.
    const halfFov = MathUtils.degToRad(camera.fov / 2);
    const usableAspect = camera.aspect * (1 - 2 * Math.abs(shift));

    const fitHeight = MathUtils.lerp(from.halfHeight, to.halfHeight, blend) / (Math.tan(halfFov) * (1 - covered));
    const fitWidth = MathUtils.lerp(from.halfWidth, to.halfWidth, blend) / (Math.tan(halfFov) * usableAspect);
    const radius = Math.max(fitHeight, fitWidth);

    const azimuth = MathUtils.lerp(from.azimuth, to.azimuth, blend) + driftX * 0.1;
    const elevation = MathUtils.lerp(from.elevation, to.elevation, blend) - driftY * 0.04;

    lookAt.set(
      MathUtils.lerp(from.target[0], to.target[0], blend),
      MathUtils.lerp(from.target[1], to.target[1], blend),
      MathUtils.lerp(from.target[2], to.target[2], blend),
    );

    camera.position.set(
      lookAt.x + radius * Math.sin(azimuth) * Math.cos(elevation),
      lookAt.y + radius * Math.sin(elevation),
      lookAt.z + radius * Math.cos(azimuth) * Math.cos(elevation),
    );

    camera.lookAt(lookAt);
  };

  const draw = () => {
    placeCamera(current);
    renderer.render(scene, camera);
  };

  const invalidate = () => {
    if (frame || !active || disposed) return;

    previous = performance.now();
    frame = requestAnimationFrame(tick);
  };

  const tick = (now: number) => {
    frame = 0;

    const delta = Math.min((now - previous) / 1000, 0.1);
    const ease = 1 - Math.exp(-delta * 8);

    previous = now;

    // Ease toward the scroll position, then land on it exactly so drawing can stop.
    const next = Math.abs(target - current) < 0.0004 ? target : current + (target - current) * ease;

    if (next !== current) {
      current = next;
      applyProgress(current);
      onProgress?.(current);
    }

    driftX = Math.abs(pointerX - driftX) < 0.002 ? pointerX : driftX + (pointerX - driftX) * ease * 0.6;
    driftY = Math.abs(pointerY - driftY) < 0.002 ? pointerY : driftY + (pointerY - driftY) * ease * 0.6;

    draw();

    if (current !== target || driftX !== pointerX || driftY !== pointerY) {
      frame = requestAnimationFrame(tick);
    }
  };

  const resize = () => {
    const { clientWidth: width, clientHeight: height } = canvas;

    if (width === 0 || height === 0) return;

    // Phones and small tablets get fewer pixels and a smaller shadow map.
    const compact = window.innerWidth < 960;

    const styles = getComputedStyle(canvas);

    // --scene-shift moves the scene sideways as a share of the canvas width (0.18 = 18% to the right).
    // --scene-top is how many pixels at the top of the canvas are covered, for example by a fixed header.
    shift = Number(styles.getPropertyValue('--scene-shift')) || 0;

    const top = Number(styles.getPropertyValue('--scene-top')) || 0;

    covered = top / height;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact ? 1.5 : 1.75));
    renderer.setSize(width, height, false);

    camera.aspect = width / height;

    // Centre the scene in the part of the canvas that is actually free.
    if (shift === 0 && top === 0) camera.clearViewOffset();
    else camera.setViewOffset(width, height, -shift * width, -top / 2, width, height);

    camera.updateProjectionMatrix();

    fitShadow(compact);
    invalidate();
  };

  // First frame, drawn straight away so the caller knows the scene really works.
  current = target;

  resize();
  applyProgress(current);
  onProgress?.(current);
  draw();

  return {
    setProgress(progress) {
      target = clamp01(progress);
      invalidate();
    },

    setPointer(x, y) {
      pointerX = MathUtils.clamp(x, -1, 1);
      pointerY = MathUtils.clamp(y, -1, 1);
      invalidate();
    },

    setActive(next) {
      active = next;

      if (active) invalidate();
      else if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    },

    resize,

    dispose() {
      if (disposed) return;

      disposed = true;
      cancelAnimationFrame(frame);

      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();

      scene.traverse((object) => {
        if (object instanceof Mesh) {
          geometries.add(object.geometry);

          for (const material of [object.material].flat()) materials.add(material);
        }

        if (object instanceof InstancedMesh) object.dispose();
      });

      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());

      environment.dispose();
      sun.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
