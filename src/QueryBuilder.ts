import { Pool } from 'pg';
import type { GetResult } from './Types.js';
import { FilterBuilder } from './FilterBuilder.js';
import type { AuthContext } from './AuthContext.js';

export class QueryBuilder<Row = unknown, Insert = unknown, Update = unknown> {
  private _pool: Pool;
  private _table: string;
  private _schema: string;
  private _auth?: AuthContext;

  constructor(pool: Pool, table: string, schema: string, auth?: AuthContext) {
    this._pool = pool;
    this._table = table;
    this._schema = schema;
    if (auth !== undefined) {
      this._auth = auth;
    }
  }

  select<SelectString extends string = '*'>(
    columns?: SelectString,
    options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }
  ): FilterBuilder<GetResult<Row, SelectString>> {
    return new FilterBuilder<GetResult<Row, SelectString>>(
      this._pool,
      this._table,
      'SELECT',
      columns || '*',
      undefined,
      undefined,
      this._schema,
      this._auth,
      options?.count,
      options?.head
    );
  }

  insert(data: Insert | Insert[], options?: { count?: 'exact' | 'planned' | 'estimated' }): FilterBuilder<Row> {
    return new FilterBuilder<Row>(
      this._pool,
      this._table,
      'INSERT',
      '*',
      data,
      undefined,
      this._schema,
      this._auth,
      options?.count
    );
  }

  update(data: Update, options?: { count?: 'exact' | 'planned' | 'estimated' }): FilterBuilder<Row> {
    return new FilterBuilder<Row>(
      this._pool,
      this._table,
      'UPDATE',
      '*',
      data,
      undefined,
      this._schema,
      this._auth,
      options?.count
    );
  }

  delete(options?: { count?: 'exact' | 'planned' | 'estimated' }): FilterBuilder<Row> {
    return new FilterBuilder<Row>(
      this._pool,
      this._table,
      'DELETE',
      '*',
      undefined,
      undefined,
      this._schema,
      this._auth,
      options?.count
    );
  }

  upsert(data: Insert | Insert[], options?: { onConflict?: string; ignoreDuplicates?: boolean; count?: 'exact' | 'planned' | 'estimated' }): FilterBuilder<Row> {
    return new FilterBuilder<Row>(
      this._pool,
      this._table,
      'UPSERT',
      '*',
      data,
      options?.onConflict,
      this._schema,
      this._auth,
      options?.count,
      undefined,
      options?.ignoreDuplicates
    );
  }
}
