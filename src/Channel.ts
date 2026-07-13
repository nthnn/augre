import { Pool } from 'pg';
import type { PoolClient } from 'pg';

export class Channel {
  private _pool: Pool;
  private _channel: string;
  private _client: PoolClient | null = null;
  private _callbacks: ((payload: unknown) => void)[] = [];

  constructor(pool: Pool, name: string) {
    this._pool = pool;
    this._channel = name;
  }

  on(event: 'postgres_changes', filter: unknown, callback: (payload: unknown) => void): this {
    this._callbacks.push(callback);
    return this;
  }

  async subscribe(callback?: (status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR', err?: Error) => void) {
    try {
      this._client = await this._pool.connect();
      this._client.on('notification', (msg) => {
        if (msg.channel === this._channel) {
          let payload: unknown = msg.payload;
          try {
            if (payload && typeof payload === 'string') {
              payload = JSON.parse(payload);
            }
          } catch { }

          this._callbacks.forEach(cb => cb(payload));
        }
      });

      await this._client.query(`LISTEN "${this._channel}"`);
      if (callback) {
        callback('SUBSCRIBED');
      }
    } catch (e) {
      if (callback) {
        callback('CHANNEL_ERROR', e as Error);
      }
    }
  }

  async unsubscribe() {
    if (this._client) {
      try {
        await this._client.query(`UNLISTEN "${this._channel}"`);
      } catch { }

      this._client.release();
      this._client = null;
    }
  }
}
