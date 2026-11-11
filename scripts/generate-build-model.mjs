/**
 * Builds the 3D model for the build story: src/assets/models/build-envelope.glb.
 *
 * 1. Blender runs scripts/build-model.py in the background and exports an uncompressed .glb.
 * 2. Objects that share a mesh become one GPU-instanced batch, with each instance's timing kept beside it.
 * 3. The result is quantized and compressed with Meshopt.
 *
 * Usage: bun run model [--blend <file.blend>]
 *
 * Needs Blender 5 (made with 5.2): on the PATH, in /Applications on a Mac, or named by the BLENDER
 * environment variable. `--blend` also saves the scene, to open and inspect in Blender.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { NodeIO } from '@gltf-transform/core';
import { EXTMeshGPUInstancing, EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'src/assets/models/build-envelope.glb');

const STAGES = ['envelope', 'finish'];
const MOTIONS = ['grow-x', 'grow-y', 'drop', 'fly', 'reveal'];

const blendFlag = process.argv.indexOf('--blend');
const blend = blendFlag === -1 ? undefined : process.argv[blendFlag + 1];

if (blendFlag !== -1 && !blend) throw new Error('--blend needs a file name, for example --blend build-envelope.blend');

function findBlender() {
  const bundled = '/Applications/Blender.app/Contents/MacOS/Blender';

  if (process.env.BLENDER) return process.env.BLENDER;
  if (spawnSync('blender', ['--version'], { stdio: 'ignore' }).status === 0) return 'blender';
  if (existsSync(bundled)) return bundled;

  throw new Error('Blender was not found. Install it, or set BLENDER to the path of its executable.');
}

/** Step 1: author the model. Blender's own log is shown only if it fails. */
function runBlender(target) {
  const args = ['--background', '--factory-startup', '--python-exit-code', '1', '--python', path.join(root, 'scripts/build-model.py'), '--', '--out', target];

  if (blend) args.push('--blend', path.resolve(blend));

  const result = spawnSync(findBlender(), args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  if (result.status !== 0 || !existsSync(target)) {
    throw new Error(`Blender could not build the model.\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  }

  console.log(result.stdout.match(/^build-model: .*$/m)?.[0] ?? 'build-model: done');
}

/** The build properties every object carries, checked so a mistake in the Blender script fails here and not in the browser. */
function readBuild(node) {
  const { stage, motion, at, span, covers } = node.getExtras();
  const name = node.getName();

  if (!STAGES.includes(stage)) throw new Error(`${name}: unknown stage "${stage}"`);
  if (!MOTIONS.includes(motion)) throw new Error(`${name}: unknown motion "${motion}"`);
  if (typeof at !== 'number' || at < 0) throw new Error(`${name}: "at" must be a number from 0`);
  if (typeof span !== 'number' || span <= 0) throw new Error(`${name}: "span" must be a number above 0`);

  if (covers !== undefined && (typeof covers !== 'string' || motion !== 'reveal')) {
    throw new Error(`${name}: "covers" names the object under a part that is revealed`);
  }

  return { stage, motion, at, span, covers };
}

const round = (value) => Math.round(value * 10000) / 10000;
const same = (values) => values.every((value) => value === values[0]);

/**
 * Step 2: one node per mesh. A mesh used once keeps its node; a mesh used many times becomes a
 * single EXT_mesh_gpu_instancing batch whose extras hold one start time per instance.
 */
function batchInstances() {
  return (document) => {
    const scene = document.getRoot().listScenes()[0];
    const buffer = document.getRoot().listBuffers()[0];
    const instancing = document.createExtension(EXTMeshGPUInstancing).setRequired(true);

    const groups = new Map();

    for (const node of scene.listChildren()) {
      const mesh = node.getMesh();

      if (!mesh) throw new Error(`${node.getName()}: every object in the model must be a mesh`);
      if (node.listChildren().length > 0) throw new Error(`${node.getName()}: objects must not be parented`);
      if (mesh.listPrimitives().length !== 1) throw new Error(`${mesh.getName()}: use one material per mesh`);

      groups.set(mesh, [...(groups.get(mesh) ?? []), node]);
    }

    for (const [mesh, nodes] of groups) {
      const builds = nodes.map(readBuild);
      const [{ stage, motion }] = builds;

      if (!same(builds.map((build) => build.stage)) || !same(builds.map((build) => build.motion))) {
        throw new Error(`${mesh.getName()}: objects that share a mesh must share a stage and a motion`);
      }

      const starts = builds.map((build) => round(build.at));
      const spans = builds.map((build) => round(build.span));

      if (!same(spans)) throw new Error(`${mesh.getName()}: objects that share a mesh must share a span`);

      // A mesh used once keeps its own node, and the name it was given in Blender.
      if (nodes.length === 1) {
        const [{ covers }] = builds;

        nodes[0].setExtras({ stage, motion, at: starts[0], span: spans[0], ...(covers && { covers }) });

        continue;
      }

      if (builds.some((build) => build.covers)) throw new Error(`${mesh.getName()}: a repeated part cannot cover another`);
      if (motion === 'reveal' && !same(starts)) throw new Error(`${mesh.getName()}: a repeated part is revealed as one, so its objects must start together`);

      const translation = new Float32Array(nodes.length * 3);
      const rotation = new Float32Array(nodes.length * 4);
      const scale = new Float32Array(nodes.length * 3);

      nodes.forEach((node, index) => {
        translation.set(node.getTranslation(), index * 3);
        rotation.set(node.getRotation(), index * 4);
        scale.set(node.getScale(), index * 3);
      });

      const accessor = (type, array) => document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
      const batch = instancing.createInstancedMesh().setAttribute('TRANSLATION', accessor('VEC3', translation));

      // Rotation and scale are left out when no instance uses them.
      if (rotation.some((value, index) => value !== (index % 4 === 3 ? 1 : 0))) batch.setAttribute('ROTATION', accessor('VEC4', rotation));
      if (scale.some((value) => value !== 1)) batch.setAttribute('SCALE', accessor('VEC3', scale));

      const batched = document
        .createNode(mesh.getName())
        .setMesh(mesh)
        .setExtension('EXT_mesh_gpu_instancing', batch)
        .setExtras({ stage, motion, at: starts, span: spans[0] });

      scene.addChild(batched);

      for (const node of nodes) node.dispose();
    }

    const names = scene.listChildren().map((node) => node.getName());

    if (new Set(names).size !== names.length) throw new Error('Every part of the model needs its own name');

    // Gold leaf must lie exactly on the part it covers.
    for (const node of scene.listChildren()) {
      const { covers } = node.getExtras();

      if (!covers) continue;

      const covered = scene.listChildren().find((other) => other.getName() === covers);

      if (!covered || covered.getExtension('EXT_mesh_gpu_instancing')) throw new Error(`${node.getName()}: covers "${covers}", which is not a single part`);
      if (String(covered.getMatrix()) !== String(node.getMatrix())) throw new Error(`${node.getName()}: must share the placement of "${covers}"`);
    }
  };
}

/** The scene uses plain metal-roughness materials, so nothing else is kept. */
function plainMaterials() {
  return (document) => {
    for (const material of document.getRoot().listMaterials()) {
      for (const extension of material.listExtensions()) material.setExtension(extension.extensionName, null);

      material.setExtras({});
    }

    for (const mesh of document.getRoot().listMeshes()) mesh.setExtras({});
  };
}

function summarize(document) {
  const scene = document.getRoot().listScenes()[0];

  let triangles = 0;
  let instances = 0;

  for (const node of scene.listChildren()) {
    const batch = node.getExtension('EXT_mesh_gpu_instancing');
    const count = batch ? batch.getAttribute('TRANSLATION').getCount() : 1;

    const [primitive] = node.getMesh().listPrimitives();

    triangles += (primitive.getIndices().getCount() / 3) * count;
    instances += count;
  }

  return { nodes: scene.listChildren().length, instances, triangles };
}

const scratch = await mkdtemp(path.join(os.tmpdir(), 'build-model-'));

try {
  const raw = path.join(scratch, 'raw.glb');

  runBlender(raw);

  await MeshoptEncoder.ready;

  const io = new NodeIO()
    .registerExtensions([EXTMeshGPUInstancing, EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

  const document = await io.read(raw);

  document.setLogger({ debug() {}, info() {}, warn: console.warn, error: console.error });

  await document.transform(
    batchInstances(),
    plainMaterials(),
    dedup(),
    weld(),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );

  await mkdir(path.dirname(output), { recursive: true });
  await io.write(output, document);

  const { nodes, instances, triangles } = summarize(document);
  const { size } = await stat(output);

  console.log(`${path.relative(root, output)}: ${(size / 1024).toFixed(1)} KB, ${nodes} draw calls, ${instances} parts, ${triangles} triangles`);

  if (blend) console.log(`Blender scene saved to ${path.resolve(blend)}`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
