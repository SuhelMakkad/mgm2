/**
 * The 3D "how a building comes together" scene.
 *
 * Everything is procedural: instanced boxes, a lattice crane, two extruded arcade walls
 * and a dome, so there is no model file to download. A single progress value from 0 to 1
 * drives the whole build in four stages (see src/data/build-stages.ts).
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
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  Path,
  PCFShadowMap,
  PerspectiveCamera,
  Plane,
  PMREMGenerator,
  Scene,
  ShadowMaterial,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { BufferGeometry, Material } from 'three';

import { BUILD_END, STAGE_STARTS } from '../data/build-stages';

export interface SceneColors {
  accent: string;
  background: string;
}

export interface BuildSceneOptions {
  colors: SceneColors;

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

/* Dimensions, in metres. One system, so the facade closes at its corners. */

const FLOORS = 8;
const FLOOR_HEIGHT = 3.2;
const SLAB = 0.3;
const BASE = 0.9;
const TOWER_HEIGHT = FLOORS * FLOOR_HEIGHT;

const COLUMN_XS = [-6, -2, 2, 6];
const COLUMN_ZS = [-4, 0, 4];

/** Glazing planes of the tower, measured from its centre. */
const HALF_WIDTH = 6.78;
const HALF_DEPTH = 4.78;
const SPANDREL = 0.5;

const WING_X = 12.3;
const WING_WIDTH = 10.8;
const WING_DEPTH = 8.6;
const WING_HEIGHT = 7.2;

const ARCH_WIDTH = 2.1;
const ARCH_SPRINGING = 2.15;

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

/** A box that grows from one end along an axis, settles from just above, or arrives from just outside. */
interface Piece {
  position: Vector3;
  size: Vector3;
  start: number;
  duration: number;
  motion: 'grow-x' | 'grow-y' | 'grow-z' | 'drop' | 'fly';

  /** For "fly": the direction the piece arrives from. */
  normal?: Vector3;
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
      } else if (piece.motion === 'fly' && piece.normal) {
        dummy.position.addScaledVector(piece.normal, (1 - eased) * 0.8);
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

/** A stone wall with arched openings, standing on the ground plane, with softened edges. */
function createArcade(width: number, height: number, arches: number, material: Material) {
  const shape = new Shape();

  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  shape.lineTo(-width / 2, height);
  shape.closePath();

  const spacing = width / arches;
  const centres: number[] = [];

  for (let index = 0; index < arches; index += 1) {
    const centre = -width / 2 + spacing * (index + 0.5);
    const opening = new Path();

    opening.moveTo(centre - ARCH_WIDTH / 2, 0.02);
    opening.lineTo(centre - ARCH_WIDTH / 2, ARCH_SPRINGING);
    opening.absarc(centre, ARCH_SPRINGING, ARCH_WIDTH / 2, Math.PI, 0, true);
    opening.lineTo(centre + ARCH_WIDTH / 2, 0.02);
    opening.closePath();

    shape.holes.push(opening);
    centres.push(centre);
  }

  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.4,
    bevelEnabled: true,
    bevelSize: 0.025,
    bevelThickness: 0.025,
    bevelSegments: 2,
    curveSegments: 24,
  });

  const mesh = new Mesh(geometry, material);

  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return { mesh, centres };
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

export function createBuildScene(canvas: HTMLCanvasElement, options: BuildSceneOptions): BuildScene {
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
  const stone = new MeshStandardMaterial({ color: 0xe8e1d2, roughness: 0.8 });
  const plaster = new MeshStandardMaterial({ color: 0xf1eee7, roughness: 0.9 });
  const metal = new MeshStandardMaterial({ color: 0x30353c, roughness: 0.42, metalness: 0.7 });
  const accent = new MeshStandardMaterial({ color: options.colors.accent, roughness: 0.5, metalness: 0.15 });
  const glass = new MeshStandardMaterial({ color: 0x40546a, roughness: 0.08, metalness: 0, envMapIntensity: 2.2 });
  const gold = new MeshStandardMaterial({ color: 0xd8ab3e, roughness: 0.32, metalness: 1 });

  // Gilding is revealed by planes that sweep upward: one for the arch surrounds, one for the dome.
  const archGilding = new Plane(new Vector3(0, -1, 0), 0);
  const domeGilding = new Plane(new Vector3(0, -1, 0), 0);

  const archGold = gold.clone();
  const domeGold = gold.clone();

  archGold.clippingPlanes = [archGilding];
  domeGold.clippingPlanes = [domeGilding];

  /* Ground and site: an unlit shadow catcher, with a paved plot on a kerb. */

  const ground = new Mesh(new CircleGeometry(240, 48), groundMaterial);

  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;

  const kerbPlate = new Mesh(new BoxGeometry(34.6, 0.14, 24.6), kerb);
  kerbPlate.position.set(4, 0.07, 0.6);
  kerbPlate.receiveShadow = true;

  const plot = new Mesh(new BoxGeometry(34, 0.22, 24), paving);
  plot.position.set(4, 0.11, 0.6);
  plot.receiveShadow = true;

  scene.add(ground, kerbPlate, plot);

  /* Stage 1: structure. Foundations, then columns and slabs floor by floor, and the core. */

  const structure: Piece[] = [
    { position: new Vector3(0, 0.6, 0), size: new Vector3(14.2, 0.6, 10.2), start: STRUCTURE, duration: 0.04, motion: 'grow-y' },
    { position: new Vector3(WING_X, 0.6, 0), size: new Vector3(WING_WIDTH + 0.5, 0.6, WING_DEPTH + 0.5), start: STRUCTURE + 0.1, duration: 0.04, motion: 'grow-y' },
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

    // The front arcade has three arches, so its piers fall at a third of the width either side of centre, and at the ends.
    const pier = WING_WIDTH / 6;

    for (const x of [WING_X - 4.9, WING_X - pier, WING_X + pier, WING_X + 4.9]) {
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

  /* Stage 3: envelope. Corner piers first, then each floor gets its spandrel, mullions and glass. */

  const masonry: Piece[] = [];
  const framing: Piece[] = [];
  const glazing: Piece[] = [];

  const paneHeight = FLOOR_HEIGHT - SPANDREL;

  // Each face is described once: where it sits, which way it faces, and how many lights it has.
  const faces = [
    { normal: new Vector3(0, 0, 1), along: 'x' as const, plane: HALF_DEPTH, half: HALF_WIDTH, lights: 6 },
    { normal: new Vector3(-1, 0, 0), along: 'z' as const, plane: -HALF_WIDTH, half: HALF_DEPTH, lights: 4 },
    { normal: new Vector3(0, 0, -1), along: 'x' as const, plane: -HALF_DEPTH, half: HALF_WIDTH, lights: 6 },
    { normal: new Vector3(1, 0, 0), along: 'z' as const, plane: HALF_WIDTH, half: HALF_DEPTH, lights: 4 },
  ];

  const onFace = (face: (typeof faces)[number], offset: number, y: number, depth = 0) =>
    face.along === 'x'
      ? new Vector3(offset, y, face.plane + face.normal.z * depth)
      : new Vector3(face.plane + face.normal.x * depth, y, offset);

  const sized = (face: (typeof faces)[number], length: number, height: number, thickness: number) =>
    face.along === 'x' ? new Vector3(length, height, thickness) : new Vector3(thickness, height, length);

  for (const x of [-HALF_WIDTH, HALF_WIDTH]) {
    for (const z of [-HALF_DEPTH, HALF_DEPTH]) {
      masonry.push({
        position: new Vector3(x, BASE + TOWER_HEIGHT / 2, z),
        size: new Vector3(0.42, TOWER_HEIGHT, 0.42),
        start: ENVELOPE,
        duration: 0.07,
        motion: 'grow-y',
      });
    }
  }

  for (let floor = 0; floor < FLOORS; floor += 1) {
    const level = BASE + floor * FLOOR_HEIGHT;
    const start = ENVELOPE + 0.012 + floor * 0.022;

    faces.forEach((face, faceIndex) => {
      const light = (face.half * 2) / face.lights;
      const stagger = faceIndex * 0.004;

      framing.push({
        position: onFace(face, 0, level + paneHeight + SPANDREL / 2, 0.02),
        size: sized(face, face.half * 2 - 0.4, SPANDREL, 0.12),
        start: start + stagger,
        duration: 0.035,
        motion: face.along === 'x' ? 'grow-x' : 'grow-z',
      });

      for (let index = 1; index < face.lights; index += 1) {
        framing.push({
          position: onFace(face, -face.half + index * light, level + paneHeight / 2, 0.05),
          size: sized(face, 0.07, paneHeight, 0.18),
          start: start + 0.008 + stagger,
          duration: 0.03,
          motion: 'grow-y',
        });
      }

      for (let index = 0; index < face.lights; index += 1) {
        glazing.push({
          position: onFace(face, -face.half + (index + 0.5) * light, level + paneHeight / 2),
          size: sized(face, light - 0.07, paneHeight, 0.06),
          start: start + 0.014 + stagger + index * 0.003,
          duration: 0.045,
          motion: 'fly',
          normal: face.normal,
        });
      }
    });
  }

  // Parapet coping, the wing's cornice and plinth, and the entrance.
  const roof = BASE + TOWER_HEIGHT;
  const wingRoof = BASE + WING_HEIGHT;
  const wingFront = WING_DEPTH / 2;
  const wingRight = WING_X + WING_WIDTH / 2;

  masonry.push(
    { position: new Vector3(0, roof + 0.3, HALF_DEPTH), size: new Vector3(HALF_WIDTH * 2 + 0.5, 0.6, 0.4), start: ENVELOPE + 0.2, duration: 0.04, motion: 'grow-x' },
    { position: new Vector3(0, roof + 0.3, -HALF_DEPTH), size: new Vector3(HALF_WIDTH * 2 + 0.5, 0.6, 0.4), start: ENVELOPE + 0.2, duration: 0.04, motion: 'grow-x' },
    { position: new Vector3(HALF_WIDTH, roof + 0.3, 0), size: new Vector3(0.4, 0.6, HALF_DEPTH * 2 - 0.3), start: ENVELOPE + 0.21, duration: 0.04, motion: 'grow-z' },
    { position: new Vector3(-HALF_WIDTH, roof + 0.3, 0), size: new Vector3(0.4, 0.6, HALF_DEPTH * 2 - 0.3), start: ENVELOPE + 0.21, duration: 0.04, motion: 'grow-z' },

    { position: new Vector3(WING_X, wingRoof + 0.2, wingFront + 0.1), size: new Vector3(WING_WIDTH + 0.5, 0.4, 0.5), start: ENVELOPE + 0.2, duration: 0.04, motion: 'grow-x' },
    { position: new Vector3(wingRight + 0.1, wingRoof + 0.2, 0), size: new Vector3(0.5, 0.4, WING_DEPTH + 0.2), start: ENVELOPE + 0.21, duration: 0.04, motion: 'grow-z' },
    { position: new Vector3(WING_X, wingRoof + 0.2, -wingFront - 0.1), size: new Vector3(WING_WIDTH + 0.5, 0.4, 0.5), start: ENVELOPE + 0.22, duration: 0.04, motion: 'grow-x' },

    { position: new Vector3(0, 0.36, HALF_DEPTH + 1.9), size: new Vector3(6.4, 0.28, 3.8), start: ENVELOPE + 0.18, duration: 0.04, motion: 'grow-y' },
    { position: new Vector3(0, 0.62, HALF_DEPTH + 1.3), size: new Vector3(5.6, 0.26, 2.6), start: ENVELOPE + 0.2, duration: 0.04, motion: 'grow-y' },
  );

  // Entrance portal: each part rests on the one below it.
  const postHeight = 3;
  const beamHeight = 0.22;
  const canopyHeight = 0.16;

  const postTop = BASE + postHeight;
  const beamTop = postTop + beamHeight;

  framing.push(
    { position: new Vector3(-2.3, BASE + postHeight / 2, HALF_DEPTH + 0.2), size: new Vector3(0.22, postHeight, 0.5), start: ENVELOPE + 0.06, duration: 0.04, motion: 'grow-y' },
    { position: new Vector3(2.3, BASE + postHeight / 2, HALF_DEPTH + 0.2), size: new Vector3(0.22, postHeight, 0.5), start: ENVELOPE + 0.06, duration: 0.04, motion: 'grow-y' },
    { position: new Vector3(0, postTop + beamHeight / 2, HALF_DEPTH + 0.2), size: new Vector3(4.82, beamHeight, 0.5), start: ENVELOPE + 0.08, duration: 0.04, motion: 'grow-x' },
  );

  const canopy: Piece[] = [
    { position: new Vector3(0, beamTop + canopyHeight / 2, HALF_DEPTH + 1.55), size: new Vector3(5.6, canopyHeight, 3.2), start: ENVELOPE + 0.22, duration: 0.04, motion: 'drop' },
  ];

  /* Stage 4: the finish. Gold coping lines on the tower and the wing. */

  const gilding: Piece[] = [
    { position: new Vector3(WING_X, wingRoof + 0.46, wingFront + 0.1), size: new Vector3(WING_WIDTH + 0.6, 0.12, 0.56), start: FINISH + 0.08, duration: 0.05, motion: 'grow-x' },
    { position: new Vector3(wingRight + 0.1, wingRoof + 0.46, 0), size: new Vector3(0.56, 0.12, WING_DEPTH + 0.3), start: FINISH + 0.1, duration: 0.05, motion: 'grow-z' },

    { position: new Vector3(0, roof + 0.66, HALF_DEPTH), size: new Vector3(HALF_WIDTH * 2 + 0.6, 0.12, 0.46), start: FINISH + 0.12, duration: 0.05, motion: 'grow-x' },
    { position: new Vector3(HALF_WIDTH, roof + 0.66, 0), size: new Vector3(0.46, 0.12, HALF_DEPTH * 2 - 0.3), start: FINISH + 0.13, duration: 0.05, motion: 'grow-z' },
    { position: new Vector3(0, roof + 0.66, -HALF_DEPTH), size: new Vector3(HALF_WIDTH * 2 + 0.6, 0.12, 0.46), start: FINISH + 0.14, duration: 0.05, motion: 'grow-x' },
    { position: new Vector3(-HALF_WIDTH, roof + 0.66, 0), size: new Vector3(0.46, 0.12, HALF_DEPTH * 2 - 0.3), start: FINISH + 0.15, duration: 0.05, motion: 'grow-z' },
  ];

  const sets = [
    createPieces(structure, concrete),
    createPieces(services, accent),
    createPieces(partitions, plaster),
    createPieces(masonry, stone),
    createPieces(framing, metal),
    createPieces(glazing, glass),
    createPieces(canopy, accent),
    createPieces(gilding, gold),
  ];

  scene.add(...sets.map((set) => set.mesh));

  /* The wing: arcaded stone walls, a plaster dome, and the gilding that goes over it. */

  const front = createArcade(WING_WIDTH, WING_HEIGHT, 3, stone);
  front.mesh.position.set(WING_X, BASE, wingFront - 0.2);

  const side = createArcade(WING_DEPTH, WING_HEIGHT, 2, stone);
  side.mesh.position.set(wingRight - 0.2, BASE, 0);
  side.mesh.rotation.y = Math.PI / 2;

  const back = new Mesh(new BoxGeometry(WING_WIDTH, WING_HEIGHT, 0.4), stone);
  back.geometry.translate(0, WING_HEIGHT / 2, 0);
  back.position.set(WING_X, BASE, -wingFront);
  back.castShadow = true;
  back.receiveShadow = true;

  const walls = [front.mesh, side.mesh, back];

  const dome = new Group();
  const domeRadius = 2.5;

  dome.position.set(WING_X, wingRoof, 0);

  const drum = new Mesh(new CylinderGeometry(2.75, 2.75, 0.8, 48), stone);
  drum.position.y = 0.4;

  const shell = new Mesh(new SphereGeometry(domeRadius, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), plaster);
  shell.position.y = 0.8;

  const finial = new Mesh(new ConeGeometry(0.13, 1.4, 16), plaster);
  finial.position.y = 0.8 + domeRadius + 0.55;

  // The gold skin sits a hair outside the plaster and is uncovered from the base upward.
  const leaf = new Mesh(new SphereGeometry(domeRadius + 0.02, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), domeGold);
  leaf.position.copy(shell.position);

  const leafFinial = new Mesh(new ConeGeometry(0.15, 1.44, 16), domeGold);
  leafFinial.position.copy(finial.position);

  for (const part of [drum, shell, finial, leaf, leafFinial]) {
    part.castShadow = true;
    part.receiveShadow = true;
    dome.add(part);
  }

  // Gilded surrounds over each arch.
  const surround = new TorusGeometry(ARCH_WIDTH / 2 + 0.16, 0.075, 10, 32, Math.PI);

  const surrounds = [
    ...front.centres.map((centre) => {
      const ring = new Mesh(surround, archGold);

      ring.position.set(WING_X + centre, BASE + ARCH_SPRINGING, wingFront + 0.24);

      return ring;
    }),

    ...side.centres.map((centre) => {
      const ring = new Mesh(surround, archGold);

      ring.position.set(wingRight + 0.24, BASE + ARCH_SPRINGING, -centre);
      ring.rotation.y = Math.PI / 2;

      return ring;
    }),
  ];

  scene.add(...walls, dome, ...surrounds);

  /* Tower crane: a lattice mast and jib. It builds the frame, then is struck as the envelope closes. */

  const crane = new Group();
  const craneHeight = 31;
  const mastHalf = 0.6;

  crane.position.set(-11.5, 0.22, -7.5);

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

    // The wing's walls and its plaster dome rise with the envelope.
    const wallsUp = easeOut(ramp(built, ENVELOPE + 0.06, ENVELOPE + 0.18));

    for (const wall of walls) {
      wall.visible = wallsUp > 0;
      wall.scale.y = Math.max(wallsUp, 0.001);
    }

    const domeUp = smooth(ramp(built, ENVELOPE + 0.16, ENVELOPE + 0.24));

    dome.visible = domeUp > 0;
    dome.scale.setScalar(Math.max(domeUp, 0.001));

    // Gilding: the arch surrounds first, then the dome from its base to its finial.
    const arches = smooth(ramp(built, FINISH + 0.01, FINISH + 0.07));
    const domeLeaf = smooth(ramp(built, FINISH + 0.05, FINISH + 0.15));

    for (const ring of surrounds) ring.visible = arches > 0;

    archGilding.constant = BASE + ARCH_SPRINGING + arches * (ARCH_WIDTH / 2 + 0.3);

    leaf.visible = domeLeaf > 0;
    leafFinial.visible = domeLeaf > 0;

    domeGilding.constant = dome.position.y + 0.8 + domeLeaf * (domeRadius + 1.4);

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
