import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Session, Message } from '../types.js';

export class SessionManager {
  private dir: string;

  constructor(sessionsDir: string) {
    this.dir = sessionsDir;
    mkdirSync(this.dir, { recursive: true });
  }

  /** Create a new session */
  create(): Session {
    return {
      id: randomUUID().slice(0, 8),
      cwd: process.cwd(),
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /** Save session to disk */
  save(session: Session): void {
    session.updatedAt = new Date().toISOString();
    const path = join(this.dir, `${session.id}.json`);
    writeFileSync(path, JSON.stringify(session, null, 2), 'utf-8');
  }

  /** Load a session by ID */
  load(id: string): Session | null {
    const path = join(this.dir, `${id}.json`);
    if (!existsSync(path)) return null;

    try {
      const data = readFileSync(path, 'utf-8');
      return JSON.parse(data) as Session;
    } catch {
      return null;
    }
  }

  /** List all sessions (most recent first) */
  list(): Array<{ id: string; cwd: string; messageCount: number; updatedAt: string }> {
    if (!existsSync(this.dir)) return [];

    const files = readdirSync(this.dir).filter(f => f.endsWith('.json'));
    const sessions: Array<{ id: string; cwd: string; messageCount: number; updatedAt: string }> = [];

    for (const file of files) {
      try {
        const data = readFileSync(join(this.dir, file), 'utf-8');
        const session = JSON.parse(data) as Session;
        sessions.push({
          id: session.id,
          cwd: session.cwd,
          messageCount: session.messages.length,
          updatedAt: session.updatedAt,
        });
      } catch {
        // Skip corrupt sessions
      }
    }

    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Add messages to session and auto-save */
  addMessages(session: Session, ...messages: Message[]): void {
    session.messages.push(...messages);
    this.save(session);
  }
}
