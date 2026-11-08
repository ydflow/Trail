import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Message, Run, Session, SessionMeta } from '@finagent/core';
import type { MessageRepository, RunRepository, SessionRepository } from '../storage/index.ts';

export interface SessionManagerOptions {
  sessions: SessionRepository;
  messages: MessageRepository;
  runs: RunRepository;
  /** Directory holding one runtime session file per Trail session. */
  piSessionDir: string;
  now?: () => number;
}

/**
 * Owns session lifecycle and persistence. The renderer never writes sessions
 * directly; everything goes through this manager, so Jotai stays a view cache
 * and the repository stays the source of truth.
 */
export class SessionManager {
  private readonly sessions: SessionRepository;
  private readonly messages: MessageRepository;
  private readonly runs: RunRepository;
  private readonly piSessionDir: string;
  private readonly now: () => number;

  constructor(options: SessionManagerOptions) {
    this.sessions = options.sessions;
    this.messages = options.messages;
    this.runs = options.runs;
    this.piSessionDir = options.piSessionDir;
    this.now = options.now ?? Date.now;
  }

  async listSessions(): Promise<SessionMeta[]> {
    return this.sessions.list();
  }

  async getSession(id: string): Promise<SessionMeta | null> {
    return this.sessions.get(id);
  }

  async createSession(title?: string): Promise<SessionMeta> {
    const id = randomUUID();
    const now = this.now();
    const session: Session = {
      id,
      title: title?.trim() || 'New Session',
      status: 'idle',
      createdAt: now,
      updatedAt: now,
      runtimeSessionPath: join(this.piSessionDir, `${id}.jsonl`),
    };
    const meta: SessionMeta = { ...session, messageCount: 0 };
    await this.sessions.upsert(meta);
    return meta;
  }

  async deleteSession(id: string): Promise<void> {
    await this.sessions.remove(id);
  }

  async renameSession(id: string, title: string): Promise<SessionMeta | null> {
    return this.sessions.rename(id, title, this.now());
  }

  /** Persist a session field update and refresh `updatedAt`. */
  async updateSession(id: string, patch: Partial<Session>): Promise<SessionMeta | null> {
    return this.sessions.update(id, { ...patch, updatedAt: this.now() });
  }

  async listMessages(sessionId: string): Promise<Message[]> {
    return this.messages.list(sessionId);
  }

  /** Persist a message and keep the session index stats in sync. */
  async appendMessage(sessionId: string, message: Message): Promise<Message[]> {
    const messages = await this.messages.append(sessionId, message);
    await this.sessions.update(sessionId, {
      messageCount: messages.length,
      lastMessageAt: message.timestamp,
      updatedAt: this.now(),
    });
    return messages;
  }

  async listRuns(sessionId: string): Promise<Run[]> {
    return this.runs.list(sessionId);
  }

  async getRun(sessionId: string, runId: string): Promise<Run | null> {
    return this.runs.get(sessionId, runId);
  }
}
