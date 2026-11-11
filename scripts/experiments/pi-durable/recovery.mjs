import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { appendFile, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { createRegistry, defineExtension, defineTask, Harness } from '@earendil-works/pi-durable';
import { openNodeJsonlStorage } from '@earendil-works/pi-durable/storage/jsonl/node';

const context = BACKGROUND_CONTEXT;
const script = fileURLToPath(import.meta.url);

async function runWorker(directory, mode) {
  async function readFixture(name) {
    const value = JSON.parse(await readFile(join(directory, `${name}.json`), 'utf8'));
    // This diagnostic records actual read attempts, including an uncommitted read.
    await appendFile(join(directory, 'attempts.jsonl'), JSON.stringify({ name, pid: process.pid }) + '\n');
    return value;
  }

  const ReadTwoFiles = defineTask({
    name: 'trail.experiment.read-two-files',
    version: 1,
    initial: () => ({ phase: 'first' }),
    phases: {
      first: async (_task, runtime, taskContext) => {
        const first = await readFixture('first');
        await runtime.commit(() => ({ status: 'running', checkpoint: { phase: 'second', first } }), taskContext);
      },
      second: async (task, runtime, taskContext) => {
        const second = await readFixture('second');
        if (mode === 'start') {
          // The first result is durable. The second read finished but has no saved outcome.
          console.log(JSON.stringify({ event: 'kill-ready', taskId: task.id, first: task.state.checkpoint.first }));
          await new Promise(() => {
            setInterval(() => {}, 1000);
          });
        }
        await runtime.commit(() => ({
          status: 'terminal',
          outcome: { status: 'completed', result: { first: task.state.checkpoint.first, second } },
        }), taskContext);
      },
    },
    abort: (_task, runtime, taskContext) => runtime.commit(
      () => ({ status: 'terminal', outcome: { status: 'aborted' } }), taskContext,
    ),
  });

  const registry = createRegistry();
  registry.install(defineExtension({ name: 'trail-experiment', tasks: [ReadTwoFiles] }));
  const storage = await openNodeJsonlStorage(join(directory, 'store'), context, { fsync: true });
  const harness = await Harness.open(storage, { models: createModels(), registry }, context);
  try {
    const root = await harness.root(context);
    let manifest;
    if (mode === 'start') {
      const taskId = await root.commit(
        (tx) => tx.createTask(ReadTwoFiles, {}, { ownership: { kind: 'conversation' } }), context,
      );
      manifest = { taskId, conversationId: root.id };
      await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
    } else {
      manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
      assert.equal(root.id, manifest.conversationId);
      const saved = await harness.getTask(manifest.taskId, context);
      assert(saved);
      await writeFile(join(directory, `${mode}-before.json`), JSON.stringify(saved.state));
    }
    const completed = await harness.waitForTask(manifest.taskId, context);
    assert.equal(completed.state.outcome.status, 'completed');
    await writeFile(join(directory, `${mode}-after.json`), JSON.stringify({
      ...manifest, state: completed.state, pid: process.pid,
    }, null, 2));
    console.log(JSON.stringify({ event: 'completed', taskId: manifest.taskId }));
  } finally {
    await harness.close(context);
  }
}

async function runExperiment() {
  const directory = await mkdtemp(join(tmpdir(), 'trail-pi-durable-'));
  const first = { symbol: 'NVDA.US', source: 'local-fixture', value: 1 };
  const second = { symbol: 'AAPL.US', source: 'local-fixture', value: 2 };
  await writeFile(join(directory, 'first.json'), JSON.stringify(first));
  await writeFile(join(directory, 'second.json'), JSON.stringify(second));
  const children = new Set();
  function launch(mode, expectedEvent) {
    const child = spawn(process.execPath, [script, '--worker', directory, mode], {
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    children.add(child);
    const watchdog = setTimeout(() => child.kill('SIGKILL'), 30000);
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (data) => { stderr += data; });
    const lines = createInterface({ input: child.stdout });
    const exited = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => {
        clearTimeout(watchdog);
        children.delete(child);
        lines.close();
        resolve({ code, signal, stderr });
      });
    });
    const reached = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`${mode} timed out\n${stderr}`)), 30000);
      lines.on('line', (line) => {
        try {
          const event = JSON.parse(line);
          if (event.event === expectedEvent) {
            clearTimeout(timeout);
            resolve(event);
          }
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      });
      exited.then((result) => {
        clearTimeout(timeout);
        reject(new Error(`${mode} exited before ${expectedEvent}: ${JSON.stringify(result)}`));
      }, (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    return { child, reached, exited };
  }

  try {
    const started = launch('start', 'kill-ready');
    const killPoint = await started.reached;
    assert.deepEqual(killPoint.first, first);
    assert(started.child.kill('SIGKILL'));
    const killed = await started.exited;
    assert(killed.code !== 0 || killed.signal !== null);
    await writeFile(join(directory, 'first.json'), JSON.stringify({ ...first, value: 999 }));

    const resumed = launch('resume', 'completed');
    await resumed.reached;
    assert.equal((await resumed.exited).code, 0);
    const before = JSON.parse(await readFile(join(directory, 'resume-before.json'), 'utf8'));
    const after = JSON.parse(await readFile(join(directory, 'resume-after.json'), 'utf8'));
    assert.equal(before.status, 'pending');
    assert.equal(before.checkpoint.phase, 'second');
    assert.deepEqual(before.checkpoint.first, first);
    assert.equal(after.taskId, killPoint.taskId);
    assert.deepEqual(after.state.outcome.result, { first, second });

    // A third fresh process opens an already completed task without dispatching its reads.
    const reopened = launch('reopen', 'completed');
    await reopened.reached;
    assert.equal((await reopened.exited).code, 0);
    const settled = JSON.parse(await readFile(join(directory, 'reopen-after.json'), 'utf8'));
    assert.deepEqual(settled.state, after.state);
    assert.notEqual(after.pid, settled.pid);
    const attempts = (await readFile(join(directory, 'attempts.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(attempts.map((attempt) => attempt.name), ['first', 'second', 'second']);
    assert.notEqual(attempts[0].pid, attempts[2].pid);
    const verification = {
      status: 'passed', runtime: process.versions, taskId: after.taskId,
      sourceSha256: createHash('sha256').update(await readFile(script)).digest('hex'),
      packageLockSha256: createHash('sha256').update(await readFile(new URL('./package-lock.json', import.meta.url))).digest('hex'),
      conversationId: after.conversationId, killPoint, killed, before, after, settled, attempts,
      completedReadAttempts: 1, uncommittedReadAttempts: 2,
    };
    await writeFile(join(directory, 'verification.json'), JSON.stringify(verification, null, 2));
    console.log(JSON.stringify({ status: 'passed', directory, firstReads: 1, secondReads: 2, taskId: after.taskId }));
  } finally {
    for (const child of children) {
      const stopped = once(child, 'close');
      child.kill('SIGKILL');
      await stopped;
    }
    // Keep fixture-only evidence for inspection, including failures.
    console.error(`Evidence directory: ${directory}`);
  }
}

if (process.argv[2] === '--worker') {
  await runWorker(process.argv[3], process.argv[4]);
} else {
  await runExperiment();
}
