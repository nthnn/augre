import { Pool } from 'pg';
import type { QueryResult } from './Types.js';
import type { AuthContext } from './AuthContext.js';


export class RpcBuilder<ResultType = any> implements PromiseLike<QueryResult<ResultType>> {
  private _pool: Pool;
  private _fn: string;
  private _schema: string;
  private _args?: Record<string, unknown>;
  private _auth?: AuthContext;

  constructor(pool: Pool, fn: string, args?: Record<string, unknown>, schema = 'public', auth?: AuthContext) {
    this._pool = pool;
    this._fn = fn;
    this._schema = schema;

    if (args !== undefined) {
      this._args = args;
    }

    if (auth !== undefined) {
      this._auth = auth;
    }
  }

  then<TResult1 = QueryResult<ResultType>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<ResultType>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return (this._execute() as unknown as Promise<QueryResult<ResultType>>)
      .then(onfulfilled, onrejected);
  }

  private async _execute(): Promise<QueryResult<unknown>> {
    const client = await this._pool.connect();
    let useTransaction = false;

    try {
      if (this._auth) {
        useTransaction = true;
        await client.query('BEGIN');

        if (this._auth.role) {
          await client.query(`SELECT set_config('role', $1, true)`, [this._auth.role]);
        }

        if (this._auth.user_id) {
          await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [this._auth.user_id]);
        }
      }

      const values: unknown[] = [];
      let query = '';

      if (this._args && Object.keys(this._args).length > 0) {
        const keys = Object.keys(this._args);
        const argsStr = keys.map((k, i) => {
          values.push(this._args![k]);
          return `"${k}" := $${i + 1}`;
        }).join(', ');
        query = `SELECT * FROM "${this._schema}"."${this._fn}"(${argsStr})`;
      } else {
        query = `SELECT * FROM "${this._schema}"."${this._fn}"()`;
      }

      const res = await client.query(query, values);
      if (useTransaction) {
        await client.query('COMMIT');
      }

      return {
        data: res.rows as unknown,
        error: null
      };
    } catch (error: unknown) {
      if (useTransaction) {
        await client.query('ROLLBACK');
      }
      return {
        data: null,
        error: error instanceof Error ? error : new Error(String(error))
      };
    } finally {
      client.release();
    }
  }
}
