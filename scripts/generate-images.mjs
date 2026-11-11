/**
 * Generates site photographs with the Codex CLI and saves them to src/assets/images.
 *
 * It follows the call sequence in docs/codex-cli.md (`codex app-server` over stdio),
 * with the same flags except that image generation stays enabled. Codex must be signed in.
 *
 * Usage:
 *   node scripts/generate-images.mjs                    generate every scene that has no image yet
 *   node scripts/generate-images.mjs hero-home hse      generate (and overwrite) the named scenes
 *
 * Scenes and the shared style live in scripts/image-prompts.json. To add a picture, add a scene
 * there, run this script, then use it with image('<name>') from src/data/images.ts.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'src/assets/images');

const CONCURRENCY = 4;

const { style, scenes } = JSON.parse(await readFile(path.join(import.meta.dirname, 'image-prompts.json'), 'utf8'));

const requested = process.argv.slice(2);
const unknown = requested.filter((name) => !(name in scenes));

if (unknown.length > 0) {
  console.error(`Unknown scene(s): ${unknown.join(', ')}. Add them to scripts/image-prompts.json first.`);
  process.exit(1);
}

const names = requested.length > 0 ? requested : Object.keys(scenes).filter((name) => !existsSync(path.join(outDir, `${name}.jpg`)));

if (names.length === 0) {
  console.log('Every scene already has an image. Name a scene to regenerate it.');
  process.exit(0);
}

// Codex works in an empty folder, so it has nothing from this project to read.
const workDir = await mkdtemp(path.join(tmpdir(), 'codex-images-'));

class CodexClient {
  #child;
  #buffer = '';
  #nextId = 1;
  #pending = new Map();
  #listeners = new Set();

  constructor() {
    this.#child = spawn(
      'codex',
      [
        'app-server',
        '--disable', 'apps',
        '--disable', 'plugins',
        '--disable', 'remote_plugin',
        '--disable', 'browser_use',
        '--disable', 'browser_use_external',
        '--disable', 'computer_use',
        '--disable', 'multi_agent',
        '--disable', 'in_app_browser',
        '-c', 'web_search="disabled"',
        '-c', 'notify=[]',
        '-c', 'approval_policy="never"',
        '-c', 'sandbox_mode="read-only"',
      ],
      { cwd: workDir, stdio: ['pipe', 'pipe', 'ignore'] },
    );

    this.#child.stdout.on('data', (chunk) => this.#read(chunk));
  }

  #read(chunk) {
    this.#buffer += chunk.toString('utf8');

    let newline;

    while ((newline = this.#buffer.indexOf('\n')) !== -1) {
      const line = this.#buffer.slice(0, newline).trim();
      this.#buffer = this.#buffer.slice(newline + 1);

      if (!line) continue;

      let message;

      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }

      if (message.id !== undefined && this.#pending.has(message.id)) {
        const { resolve, reject } = this.#pending.get(message.id);
        this.#pending.delete(message.id);

        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);

        continue;
      }

      for (const listener of this.#listeners) listener(message);
    }
  }

  request(method, params) {
    const id = this.#nextId++;

    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  notify(method) {
    this.#child.stdin.write(`${JSON.stringify({ method })}\n`);
  }

  onNotification(listener) {
    this.#listeners.add(listener);

    return () => this.#listeners.delete(listener);
  }

  close() {
    this.#child.kill();
  }
}

async function generate(client, model, name) {
  const { thread } = await client.request('thread/start', {
    cwd: workDir,
    model,
    sandbox: 'read-only',
    approvalPolicy: 'never',
    serviceTier: null,
    config: {},
    ephemeral: true,
  });

  const finished = new Promise((resolve) => {
    const images = [];

    const stop = client.onNotification((message) => {
      if (message.params?.threadId !== thread.id) return;

      if (message.method === 'item/completed' && message.params.item?.type === 'imageGeneration') {
        images.push(message.params.item);
      }

      if (message.method === 'turn/completed') {
        stop();
        resolve({ image: images.at(-1), turn: message.params.turn });
      }
    });
  });

  const instructions = 'Use the image generation tool exactly once to create the image described below. Do not run commands, read files or write files. After the image is generated, reply with the single word "done".';

  await client.request('turn/start', {
    threadId: thread.id,
    input: [{ type: 'text', text: `${instructions}\n\n${scenes[name]}\n\n${style}`, text_elements: [] }],
    effort: 'low',
    serviceTierForTurn: 'default',
  });

  const { image, turn } = await finished;

  if (!image || image.failure) {
    throw new Error(JSON.stringify(image?.failure ?? turn.error ?? 'no image returned'));
  }

  const source = image.savedPath && existsSync(image.savedPath) ? image.savedPath : Buffer.from(image.result, 'base64');

  await sharp(source).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(outDir, `${name}.jpg`));
}

const client = new CodexClient();

await client.request('initialize', {
  clientInfo: { name: 'site_image_client', title: 'Site Image Client', version: '1.0.0' },
  capabilities: null,
});

client.notify('initialized');

const { data: models } = await client.request('model/list', { cursor: null });
const model = (models.find((entry) => entry.isDefault) ?? models[0]).id;

const queue = [...names];
let failures = 0;

async function worker() {
  while (queue.length > 0) {
    const name = queue.shift();

    try {
      await generate(client, model, name);
      console.log(`ok      ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`failed  ${name}: ${error.message}`);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, names.length) }, worker));

client.close();
process.exit(failures > 0 ? 1 : 0);
