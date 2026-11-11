/**
 * The authored part of the build story: the building's envelope and its finish.
 *
 * The model is made in Blender by scripts/build-model.py and compressed into
 * src/assets/models/build-envelope.glb. Every part carries its own build properties, so this
 * module is only a player: it works out when each part starts and how far along it is.
 *
 *   stage   which story stage the part belongs to
 *   motion  how it arrives (see Motion)
 *   at      when it starts, measured from the start of its stage; one value per instance for a repeated part
 *   span    how long it takes
 *   covers  for gold leaf: the part underneath, which is hidden exactly as far as the gold has been laid
 */

import { Box3, DynamicDrawUsage, InstancedMesh, Matrix4, Mesh, Plane, Vector3 } from 'three';
import type { Material, MeshStandardMaterial, Object3D } from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

type Motion =
  /** Stretches from its low end along its own X axis, which runs along a facade. */
  | 'grow-x'
  /** Stretches upward from its base. */
  | 'grow-y'
  /** Settles into place from just above. */
  | 'drop'
  /** Arrives from just outside, along its own outward normal. */
  | 'fly'
  /** Is uncovered from the bottom up, like a wall being laid or leaf being applied. */
  | 'reveal';

interface Build {
  stage: string;
  motion: Motion;

  /** One start per piece: a single part has one piece, a batch has one per instance. */
  starts: number[];

  span: number;
  covers?: string;
}

export interface BuildModelOptions {
  /** When each stage named in the model begins, as a share of the build from 0 to 1. */
  stages: Record<string, number>;

  /** Called once for every material in the model. Return the material to draw with. */
  material?: (material: MeshStandardMaterial) => Material;
}

export interface BuildModel {
  /** Everything in the model. Add it to the scene as it is, without moving it. */
  object: Object3D;

  /** Puts every part where it belongs at this share of the build, from 0 to 1. */
  update(built: number): void;
}

/** How far a part travels as it drops or flies in, in metres. */
const DROP = 1.2;
const FLY = 0.8;

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const smooth = (t: number) => t * t * (3 - 2 * t);

const isMotion = (value: unknown): value is Motion => ['grow-x', 'grow-y', 'drop', 'fly', 'reveal'].includes(value as string);

/** Reads and checks a part's build properties, so a broken model fails at load and the still picture is shown instead. */
function readBuild(mesh: Mesh): Build {
  const { stage, motion, at, span, covers } = mesh.userData;

  const count = mesh instanceof InstancedMesh ? mesh.count : 1;
  const starts: unknown[] = Array.isArray(at) ? at : new Array(count).fill(at);

  const valid =
    typeof stage === 'string' &&
    isMotion(motion) &&
    typeof span === 'number' &&
    span > 0 &&
    starts.length === count &&
    starts.every((start) => typeof start === 'number');

  if (!valid) throw new Error(`The build model's part "${mesh.name}" has no usable build properties.`);

  return { stage, motion, starts: starts as number[], span, covers: typeof covers === 'string' ? covers : undefined };
}

/** Gives a mesh its own copy of its material the first time it needs a clipping plane. */
function clip(mesh: Mesh, plane: Plane, owned: Set<Material>) {
  let material = mesh.material as Material;

  if (!owned.has(material)) {
    material = material.clone();

    material.clippingPlanes = [];
    material.clipShadows = true;

    owned.add(material);
    mesh.material = material;
  }

  material.clippingPlanes!.push(plane);
}

/** A part that is uncovered from the bottom up by a clipping plane, and may hide the part it covers as it goes. */
function createReveal(mesh: Mesh, start: number, span: number, covered: Mesh | undefined, owned: Set<Material>) {
  const bounds = new Box3().setFromObject(mesh);

  const low = bounds.min.y;
  const high = bounds.max.y + 0.01;

  // Kept below the line: this part. Kept above it: whatever it covers.
  const below = new Plane(new Vector3(0, -1, 0), low);
  const above = new Plane(new Vector3(0, 1, 0), -low);

  clip(mesh, below, owned);

  if (covered) clip(covered, above, owned);

  return (built: number) => {
    const raw = clamp01((built - start) / span);
    const line = low + (high - low) * smooth(raw);

    mesh.visible = raw > 0;

    below.constant = line;
    above.constant = -line;
  };
}

/** A part, or a batch of instances, where each piece grows, drops or flies into place on its own schedule. */
function createPieces(mesh: Mesh, motion: Exclude<Motion, 'reveal'>, starts: number[], span: number) {
  const instanced = mesh instanceof InstancedMesh ? mesh : undefined;

  // Pieces are animated in world space, so a part behaves the same wherever the file's compression put its origin.
  const toWorld = instanced ? mesh.matrixWorld.clone() : mesh.parent!.matrixWorld.clone();
  const fromWorld = toWorld.clone().invert();

  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();

  const low = mesh.geometry.boundingBox!.min;

  const pieces = starts.map((start, index) => {
    const base = new Matrix4();

    if (instanced) instanced.getMatrixAt(index, base);
    else base.copy(mesh.matrix);

    base.premultiply(toWorld);

    // A piece flies in along its own outward axis, which is +Z once the model is in the scene.
    const normal = new Vector3(0, 0, 1).transformDirection(base);

    return { start, base, normal };
  });

  if (instanced) {
    instanced.instanceMatrix.setUsage(DynamicDrawUsage);

    // Instances move, so the bounds worked out at load would cull them wrongly.
    instanced.frustumCulled = false;
  } else {
    mesh.matrixAutoUpdate = false;
  }

  const first = Math.min(...starts);
  const last = Math.max(...starts) + span;

  const grown = new Matrix4();
  const placed = new Matrix4();

  let settled: 'before' | 'after' | undefined;

  return (built: number) => {
    const phase = built <= first ? 'before' : built >= last ? 'after' : undefined;

    // A part that has not started, or has finished, is written once and then left alone.
    if (phase && phase === settled) return;

    settled = phase;
    mesh.visible = phase !== 'before';

    if (phase === 'before') return;

    pieces.forEach((piece, index) => {
      const raw = clamp01((built - piece.start) / span);
      const eased = easeOut(raw);

      if (raw <= 0) {
        placed.makeScale(0, 0, 0);
      } else if (motion === 'grow-x') {
        // Scale about the low end of the part, not about its origin.
        grown.makeScale(eased, 1, 1).setPosition(low.x * (1 - eased), 0, 0);
        placed.multiplyMatrices(piece.base, grown);
      } else if (motion === 'grow-y') {
        grown.makeScale(1, eased, 1).setPosition(0, low.y * (1 - eased), 0);
        placed.multiplyMatrices(piece.base, grown);
      } else {
        const travel = 1 - eased;

        placed.copy(piece.base);

        // Elements 12 to 14 are the matrix's translation.
        if (motion === 'drop') {
          placed.elements[13] += travel * DROP;
        } else {
          placed.elements[12] += piece.normal.x * travel * FLY;
          placed.elements[13] += piece.normal.y * travel * FLY;
          placed.elements[14] += piece.normal.z * travel * FLY;
        }
      }

      placed.premultiply(fromWorld);

      if (instanced) instanced.setMatrixAt(index, placed);
      else mesh.matrix.copy(placed);
    });

    if (instanced) instanced.instanceMatrix.needsUpdate = true;
    else mesh.matrixWorldNeedsUpdate = true;
  };
}

export async function loadBuildModel(data: ArrayBuffer, options: BuildModelOptions): Promise<BuildModel> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const { scene: object } = await loader.parseAsync(data, '');

  object.updateMatrixWorld(true);

  const meshes: Mesh[] = [];

  object.traverse((child) => {
    if (child instanceof Mesh) meshes.push(child);
  });

  // Materials first, so a part that needs its own clipped copy clones the finished one.
  const materials = new Map<Material, Material>();

  for (const mesh of meshes) {
    const source = mesh.material as MeshStandardMaterial;

    if (!materials.has(source)) materials.set(source, options.material?.(source) ?? source);

    mesh.material = materials.get(source)!;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  const owned = new Set<Material>();
  const updates: ((built: number) => void)[] = [];

  for (const mesh of meshes) {
    const build = readBuild(mesh);
    const stage = options.stages[build.stage];

    if (stage === undefined) throw new Error(`The build model's part "${mesh.name}" belongs to an unknown stage, "${build.stage}".`);

    const starts = build.starts.map((at) => stage + at);

    if (build.motion === 'reveal') {
      const covered = build.covers ? meshes.find((other) => other.name === build.covers) : undefined;

      if (build.covers && !covered) throw new Error(`The build model's part "${mesh.name}" covers "${build.covers}", which is missing.`);

      updates.push(createReveal(mesh, starts[0], build.span, covered, owned));
    } else {
      updates.push(createPieces(mesh, build.motion, starts, build.span));
    }
  }

  return {
    object,

    update(built) {
      for (const update of updates) update(built);
    },
  };
}
