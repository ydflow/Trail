import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { Message, Run, SessionMeta } from '@finagent/core';
import { JsonFileStore } from './json-file-store.ts';
import { MessageRepository } from './message-repository.ts';
import { RunRepository } from './run-repository.ts';
import { SessionRepository } from './session-repository.ts';

let dir = '';
let store: JsonFileStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'finagent-store-'));
  store = new JsonFileStore(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function makeSession(id: string): SessionMeta {
  return {
    id,
    title: `Session ${id}`,
    status: 'idle',
    createdAt: 1000,
    updatedAt: 1000,
    messageCount: 0,
    runtimeSessionPath: `/tmp/pi/${id}.jsonl`,
  };
}

function makeMessage(id: string, content: string): Message {
  return { id, role: 'user', content, timestamp: 1000 };
}

/**
 * JsonFileStore whose reads yield before completing, widening the
 * read-modify-write window so that a lost-update regression interleaves
 * deterministically under `Promise.all`. `ConnectionStore` uses the same
 * harness for the equivalent guard.
 */
class SlowReadJsonFileStore extends JsonFileStore {
  constructor(dir: string, private readonly delayMs: number) {
    super(dir);
  }

  override async read<T>(file: string, fallback: T): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return super.read<T>(file, fallback);
  }
}

describe('JsonFileStore', () => {
  it('writes and reads back JSON', async () => {
    await store.write('a.json', { hello: 'world' });
    expect(await store.read('a.json', {})).toEqual({ hello: 'world' });
  });

  it('returns the fallback for missing files', async () => {
    expect(await store.read('missing.json', [1])).toEqual([1]);
  });

  it('never leaves a partial file behind after writes', async () => {
    await store.write('a.json', { ok: true });
    const files = await readdir(dir);
    expect(files.filter((file) => !file.endsWith('.tmp'))).toEqual(['a.json']);
  });
});

describe('SessionRepository', () => {
  it('persists a rename without changing messages or runtime identity', async () => {
    const sessions = new SessionRepository(store);
    const original = { ...makeSession('s1'), messageCount: 8, lastMessageAt: 1500 };
    await sessions.upsert(original);
    const messages = new MessageRepository(store);
    await messages.append('s1', makeMessage('m1', 'Keep this message'));
    expect(await sessions.rename('s1', '财报分析', 2000)).toEqual({ ...original, title: '财报分析', updatedAt: 2000 });
    const reloaded = new SessionRepository(new JsonFileStore(dir));
    expect(await reloaded.get('s1')).toEqual({ ...original, title: '财报分析', updatedAt: 2000 });
    expect(await messages.list('s1')).toEqual([makeMessage('m1', 'Keep this message')]);
  });

  it('does not resurrect a deleted session when a queued rename arrives', async () => {
    const sessions = new SessionRepository(store);
    await sessions.upsert(makeSession('s1'));
    const [, renamed] = await Promise.all([sessions.remove('s1'), sessions.rename('s1', 'Renamed', 2000)]);
    expect(renamed).toBeNull();
    expect(await sessions.list()).toEqual([]);
  });

  it('retains a rename while run status and message stats are updated concurrently', async () => {
    const sessions = new SessionRepository(new SlowReadJsonFileStore(dir, 10));
    await sessions.upsert(makeSession('s1'));
    await Promise.all([
      sessions.rename('s1', 'Research notes', 2000),
      sessions.update('s1', { status: 'running', messageCount: 4, lastMessageAt: 2001 }),
    ]);
    expect(await sessions.get('s1')).toMatchObject({ title: 'Research notes', status: 'running', messageCount: 4, lastMessageAt: 2001 });
  });

  it('persists sessions across store instances (reload)', async () => {
    const first = new SessionRepository(store);
    await first.upsert(makeSession('s1'));

    // New store instance on the same directory simulates an app restart.
    const second = new SessionRepository(new JsonFileStore(dir));
    const sessions = await second.list();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ id: 's1', title: 'Session s1' });
  });

  it('updates existing sessions in place', async () => {
    const repo = new SessionRepository(store);
    await repo.upsert(makeSession('s1'));

    await repo.upsert({ ...makeSession('s1'), title: 'Renamed', messageCount: 3 });
    const sessions = await repo.list();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ title: 'Renamed', messageCount: 3 });
  });

  it('removes sessions and their message/run files', async () => {
    const repo = new SessionRepository(store);
    await repo.upsert(makeSession('s1'));
    await store.write('sessions/s1/messages.json', { messages: [] });

    await repo.remove('s1');

    expect(await repo.list()).toEqual([]);
    expect(await store.read('sessions/s1/messages.json', null)).toBeNull();
  });

  it('serializes concurrent upserts so no session is silently dropped', async () => {
    const repo = new SessionRepository(new SlowReadJsonFileStore(dir, 20));
    await Promise.all([repo.upsert(makeSession('s1')), repo.upsert(makeSession('s2'))]);

    const reloaded = new SessionRepository(new JsonFileStore(dir));
    const ids = (await reloaded.list()).map((session) => session.id).sort();

    expect(ids).toEqual(['s1', 's2']);
  });
});

describe('MessageRepository', () => {
  it('appends messages in order and persists them', async () => {
    const repo = new MessageRepository(store);
    await repo.append('s1', makeMessage('m1', 'first'));
    await repo.append('s1', makeMessage('m2', 'second'));

    const reloaded = new MessageRepository(new JsonFileStore(dir));
    const messages = await reloaded.list('s1');

    expect(messages.map((message) => message.id)).toEqual(['m1', 'm2']);
  });

  it('keeps sessions isolated', async () => {
    const repo = new MessageRepository(store);
    await repo.append('s1', makeMessage('m1', 'for s1'));
    await repo.append('s2', makeMessage('m2', 'for s2'));

    expect((await repo.list('s1')).map((message) => message.id)).toEqual(['m1']);
    expect((await repo.list('s2')).map((message) => message.id)).toEqual(['m2']);
  });

  it('serializes concurrent appends so no message is silently dropped', async () => {
    const repo = new MessageRepository(new SlowReadJsonFileStore(dir, 20));
    await Promise.all([
      repo.append('s1', makeMessage('m1', 'first')),
      repo.append('s1', makeMessage('m2', 'second')),
    ]);

    const reloaded = new MessageRepository(new JsonFileStore(dir));
    const ids = (await reloaded.list('s1')).map((message) => message.id).sort();

    expect(ids).toEqual(['m1', 'm2']);
  });
});

describe('RunRepository', () => {
  it('creates, updates, and reloads runs', async () => {
    const repo = new RunRepository(store);
    const run: Run = {
      id: 'r1',
      sessionId: 's1',
      status: 'running',
      input: 'analyze portfolio',
      startedAt: 1000,
    };
    await repo.create(run);

    const completed: Run = { ...run, status: 'completed', completedAt: 2000, answer: 'done' };
    await repo.update(completed);

    const reloaded = new RunRepository(new JsonFileStore(dir));
    const runs = await reloaded.list('s1');

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: 'completed', answer: 'done', completedAt: 2000 });
  });

  it('lists runs newest first', async () => {
    const repo = new RunRepository(store);
    await repo.create({ id: 'r1', sessionId: 's1', status: 'completed', input: 'a', startedAt: 1000 });
    await repo.create({ id: 'r2', sessionId: 's1', status: 'completed', input: 'b', startedAt: 2000 });

    const runs = await repo.list('s1');
    expect(runs.map((run) => run.id)).toEqual(['r2', 'r1']);
  });

  it('serializes concurrent run writes so no run is silently dropped', async () => {
    const repo = new RunRepository(new SlowReadJsonFileStore(dir, 20));
    await Promise.all([
      repo.create({ id: 'r1', sessionId: 's1', status: 'completed', input: 'a', startedAt: 1000 }),
      repo.create({ id: 'r2', sessionId: 's1', status: 'completed', input: 'b', startedAt: 2000 }),
    ]);

    const reloaded = new RunRepository(new JsonFileStore(dir));
    const ids = (await reloaded.list('s1')).map((run) => run.id).sort();

    expect(ids).toEqual(['r1', 'r2']);
  });
});
