import { Pool } from 'pg';
import type { QueryResult } from './Types.js';
import type { AuthContext } from './AuthContext.js';
import { SchemaCache } from './SchemaCache.js';

type OrderOptions = { ascending?: boolean; nullsFirst?: boolean };

export class FilterBuilder<ResultType> implements PromiseLike<QueryResult<ResultType[]>> {
  private _pool: Pool;
  private _table: string;
  private _method: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT';
  private _columns: string;
  private _data?: unknown;
  private _onConflict?: string;
  private _schema: string;
  private _auth?: AuthContext;

  private _filters: {
    col: string,
    op: string,
    val: unknown
  }[] = [];
  private _orFilters: string[] = [];

  private _limit?: number;
  private _range?: {
    from: number;
    to: number
  };
  private _order: {
    col: string,
    options: OrderOptions
  }[] = [];
  private _single = false;
  private _maybeSingle = false;
  private _csv = false;
  private _explain = false;
  private _count?: 'exact' | 'planned' | 'estimated';
  private _head?: boolean;
  private _ignoreDuplicates?: boolean;
  private _abortSignal?: AbortSignal;
  private _returnsData: boolean;

  constructor(
    pool: Pool,
    table: string,
    method: string,
    columns: string,
    data?: unknown,
    onConflict?: string,
    schema = 'public',
    auth?: AuthContext,
    count?: 'exact' | 'planned' | 'estimated',
    head?: boolean,
    ignoreDuplicates?: boolean
  ) {
    this._pool = pool;
    this._table = table;
    this._method = method as 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'UPSERT';
    this._columns = columns;
    this._data = data;

    if (onConflict !== undefined) {
      this._onConflict = onConflict;
    }

    this._schema = schema;
    if (auth !== undefined) {
      this._auth = auth;
    }

    if (count !== undefined) {
      this._count = count;
    }

    if (head !== undefined) {
      this._head = head;
    }

    if (ignoreDuplicates !== undefined) {
      this._ignoreDuplicates = ignoreDuplicates;
    }

    this._returnsData = (this._method === 'SELECT');
  }

  select<SelectString extends string = '*'>(columns?: SelectString): this {
    this._columns = columns || '*';
    this._returnsData = true;

    return this;
  }

  eq(column: string, value: unknown): this {
    this._filters.push({ col: column, op: '=', val: value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this._filters.push({ col: column, op: '!=', val: value });
    return this;
  }

  gt(column: string, value: unknown): this {
    this._filters.push({ col: column, op: '>', val: value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this._filters.push({ col: column, op: '>=', val: value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this._filters.push({ col: column, op: '<', val: value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this._filters.push({ col: column, op: '<=', val: value });
    return this;
  }

  like(column: string, value: string): this {
    this._filters.push({ col: column, op: 'LIKE', val: value });
    return this;
  }

  ilike(column: string, value: string): this {
    this._filters.push({ col: column, op: 'ILIKE', val: value });
    return this;
  }

  is(column: string, value: boolean | null): this {
    this._filters.push({ col: column, op: 'IS', val: value });
    return this;
  }

  in(column: string, value: unknown[]): this {
    this._filters.push({ col: column, op: 'IN', val: value });
    return this;
  }

  contains(column: string, value: unknown): this {
    this._filters.push({ col: column, op: '@>', val: value });
    return this;
  }

  containedBy(column: string, value: unknown): this {
    this._filters.push({ col: column, op: '<@', val: value });
    return this;
  }

  overlaps(column: string, value: unknown): this {
    this._filters.push({ col: column, op: '&&', val: value });
    return this;
  }

  rangeGt(column: string, value: string): this {
    this._filters.push({ col: column, op: '>>', val: value });
    return this;
  }

  rangeGte(column: string, value: string): this {
    this._filters.push({ col: column, op: '&>', val: value });
    return this;
  }

  rangeLt(column: string, value: string): this {
    this._filters.push({ col: column, op: '<<', val: value });
    return this;
  }

  rangeLte(column: string, value: string): this {
    this._filters.push({ col: column, op: '&<', val: value });
    return this;
  }

  rangeAdjacent(column: string, value: string): this {
    this._filters.push({ col: column, op: '-|-', val: value });
    return this;
  }

  textSearch(column: string, query: string): this {
    this._filters.push({ col: column, op: '@@', val: query });
    return this;
  }

  match(query: Record<string, unknown>): this {
    for (const [key, value] of Object.entries(query)) {
      this._filters.push({ col: key, op: '=', val: value });
    }
    return this;
  }

  not(column: string, operator: string, value: unknown): this {
    const opMap: Record<string, string> = {
      eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=',
      like: 'LIKE', ilike: 'ILIKE', is: 'IS', in: 'IN',
      contains: '@>', containedBy: '<@', overlaps: '&&',
      rangeGt: '>>', rangeGte: '&>', rangeLt: '<<', rangeLte: '&<', rangeAdjacent: '-|-'
    };
    const sqlOp = opMap[operator] || operator;

    this._filters.push({ col: column, op: `NOT ${sqlOp}`, val: value });
    return this;
  }

  or(filters: string): this {
    this._orFilters.push(filters);
    return this;
  }

  filter(column: string, operator: string, value: unknown): this {
    const opMap: Record<string, string> = {
      eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=',
      like: 'LIKE', ilike: 'ILIKE', is: 'IS', in: 'IN',
      contains: '@>', containedBy: '<@', overlaps: '&&',
      rangeGt: '>>', rangeGte: '&>', rangeLt: '<<', rangeLte: '&<', rangeAdjacent: '-|-'
    };
    const sqlOp = opMap[operator] || operator;

    this._filters.push({ col: column, op: sqlOp, val: value });
    return this;
  }

  order(column: string, options?: OrderOptions): this {
    this._order.push({ col: column, options: options || {} });
    return this;
  }

  limit(count: number): this {
    this._limit = count;
    return this;
  }

  range(from: number, to: number): this {
    this._range = { from, to };
    return this;
  }

  csv(): PromiseLike<string> {
    this._csv = true;

    const execute = this._execute.bind(this);
    return {
      then<TResult1 = string, TResult2 = never>(
        onfulfilled?: ((value: string) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ): PromiseLike<TResult1 | TResult2> {
        return (execute() as unknown as Promise<QueryResult<ResultType[]>>).then((res) => {
          if (res.error) {
            throw res.error;
          }

          if (!res.data || res.data.length === 0) {
            return onfulfilled ? onfulfilled('' as unknown as string) : ('' as unknown as TResult1);
          }

          const keys = Object.keys(res.data[0] as Record<string, unknown>);
          const rows = res.data.map(row => keys.map(k => {
            const val = (row as Record<string, unknown>)[k];
            if (val === null || val === undefined) {
              return '';
            }

            const str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }

            return str;
          }).join(','));

          const csvString = [keys.join(','), ...rows].join('\n');
          return onfulfilled ? onfulfilled(csvString as unknown as string) : (csvString as unknown as TResult1);
        }).catch(err => {
          return onrejected ? onrejected(err) : Promise.reject(err);
        });
      }
    };
  }

  explain(): PromiseLike<QueryResult<unknown>> {
    this._explain = true;
    const execute = this._execute.bind(this);
    return {
      then<TResult1 = QueryResult<unknown>, TResult2 = never>(
        onfulfilled?: ((value: QueryResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ): PromiseLike<TResult1 | TResult2> {
        return execute().then(onfulfilled, onrejected);
      }
    };
  }

  single(): PromiseLike<QueryResult<ResultType>> {
    this._single = true;

    const execute = this._execute.bind(this);
    return {
      then<TResult1 = QueryResult<ResultType>, TResult2 = never>(
        onfulfilled?: ((value: QueryResult<ResultType>) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ): PromiseLike<TResult1 | TResult2> {
        return (execute() as unknown as Promise<QueryResult<ResultType>>)
          .then(onfulfilled, onrejected);
      }
    };
  }

  maybeSingle(): PromiseLike<QueryResult<ResultType | null>> {
    this._maybeSingle = true;

    const execute = this._execute.bind(this);
    return {
      then<TResult1 = QueryResult<ResultType | null>, TResult2 = never>(
        onfulfilled?: ((value: QueryResult<ResultType | null>) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
      ): PromiseLike<TResult1 | TResult2> {
        return (execute() as unknown as Promise<QueryResult<ResultType | null>>)
          .then(onfulfilled, onrejected);
      }
    };
  }

  returns<T>(): FilterBuilder<T> {
    return this as unknown as FilterBuilder<T>;
  }

  abortSignal(signal: AbortSignal): this {
    this._abortSignal = signal;
    return this;
  }

  then<TResult1 = QueryResult<ResultType[]>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<ResultType[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return (this._execute() as unknown as Promise<QueryResult<ResultType[]>>)
      .then(onfulfilled, onrejected);
  }

  private _quoteColumn(col: string): string {
    let cast = '';
    const castMatch = col.match(/::([a-zA-Z0-9_]+)$/);

    if (castMatch) {
      cast = `::${castMatch[1]}`;
      col = col.substring(0, col.length - castMatch[0]!.length);
    }

    if (col.includes('->')) {
      const parts = col.split(/(->>|->)/);
      let result = `"${parts[0]}"`;

      for (let k = 1; k < parts.length; k += 2) {
        const arrow = parts[k];
        const key = parts[k + 1];

        if (!isNaN(Number(key))) {
          result += `${arrow}${key}`;
        } else {
          result += `${arrow}'${key}'`;
        }
      }

      return result + cast;
    }

    if (col.includes('.')) {
      return col.split('.').map(p => `"${p}"`).join('.') + cast;
    }

    return `"${col}"${cast}`;
  }

  private _quoteSelectCol(col: string): string {
    let alias = '';
    const colonIdx = col.indexOf(':');

    if (colonIdx !== -1) {
      alias = col.substring(0, colonIdx);
      col = col.substring(colonIdx + 1);
    }

    const quotedCol = this._quoteColumn(col);
    if (alias) {
      return `${quotedCol} AS "${alias}"`;
    }

    return quotedCol;
  }

  private async _buildSelectCols(): Promise<string> {
    if (this._columns === '*') {
      return '*';
    }

    if (!this._columns.includes('(')) {
      return this._columns.split(',').map(c => this._quoteSelectCol(c.trim())).join(', ');
    }

    const fks = await SchemaCache.getForeignKeys(this._pool);
    let result = '', i = 0;

    while (i < this._columns.length) {
      const remaining = this._columns.substring(i);
      const match = remaining.match(/^\s*([a-zA-Z0-9_]+)(?::([a-zA-Z0-9_]+))?\s*\(([^)]+)\)/);

      if (match) {
        const relation = match[1];
        const alias = match[2];
        const subCols = match[3]!.split(',').map(c => this._quoteSelectCol(c.trim())).join(', ');
        const asName = alias || relation;

        const fk = fks.find(f => f.table_name === this._table && f.foreign_table_name === relation) ||
          fks.find(f => f.foreign_table_name === this._table && f.table_name === relation);

        if (fk) {
          if (fk.table_name === this._table) {
            result += `(SELECT row_to_json(_) FROM (SELECT ${subCols} FROM "${this._schema}"."${relation}" WHERE "${relation}"."${fk.foreign_column_name}" = "${this._table}"."${fk.column_name}") _) as "${asName}"`;
          } else {
            result += `(SELECT COALESCE(json_agg(row_to_json(_)), '[]'::json) FROM (SELECT ${subCols} FROM "${this._schema}"."${relation}" WHERE "${relation}"."${fk.column_name}" = "${this._table}"."${fk.foreign_column_name}") _) as "${asName}"`;
          }
        } else {
          result += `(SELECT row_to_json(_) FROM (SELECT ${subCols} FROM "${this._schema}"."${relation}" WHERE "${relation}"."id" = "${this._table}"."${relation}_id") _) as "${asName}"`;
        }

        i += match[0]!.length;
      } else {
        const commaIdx = this._columns.indexOf(',', i);
        if (commaIdx === -1) {
          const col = this._columns.substring(i).trim();
          if (col) {
            result += this._quoteSelectCol(col);
          }

          break;
        } else {
          const col = this._columns.substring(i, commaIdx).trim();
          if (col) {
            result += this._quoteSelectCol(col) + ", ";
          }

          i = commaIdx + 1;
        }
      }
    }

    return result.replace(/,\s*$/, '');
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

      let query = '';
      const values: unknown[] = [];
      let paramIndex = 1;

      const buildWhere = () => {
        let clauses: string[] = [];

        if (this._filters.length > 0) {
          clauses = clauses.concat(this._filters.map(f => {
            const qCol = this._quoteColumn(f.col);
            if (f.op === 'IS' || f.op === 'NOT IS') {
              return `${qCol} ${f.op} ${f.val === null ? 'NULL' : String(f.val).toUpperCase()}`;
            } else if ((f.op === 'IN' || f.op === 'NOT IN') && Array.isArray(f.val)) {
              if (f.val.length === 0) {
                return `1=0`;
              }

              const inVals = f.val.map(v => {
                values.push(v);
                return `$${paramIndex++}`;
              });
              return `${qCol} ${f.op} (${inVals.join(', ')})`;
            } else if (f.op === '@@' || f.op === 'NOT @@') {
              values.push(f.val);
              return `to_tsvector(${qCol}) ${f.op} to_tsquery($${paramIndex++})`;
            }

            values.push(f.val);
            return `${qCol} ${f.op} $${paramIndex++}`;
          }));
        }

        if (this._orFilters.length > 0) {
          for (const orGroup of this._orFilters) {
            const parts = orGroup.split(',');
            const subClauses: string[] = [];

            for (const part of parts) {
              const match = part.match(/([^.]+)\.(eq|neq|gt|gte|lt|lte|like|ilike)\.(.+)/);
              if (match) {
                const [, col, op, val] = match;
                const opMap: Record<string, string> = { eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', ilike: 'ILIKE' };

                values.push(val);
                subClauses.push(`${this._quoteColumn(col as string)} ${opMap[op as string] || '='} $${paramIndex++}`);
              }
            }

            if (subClauses.length > 0) {
              clauses.push(`(${subClauses.join(' OR ')})`);
            }
          }
        }

        if (clauses.length === 0) {
          return '';
        }
        return `WHERE ${clauses.join(' AND ')}`;
      };

      let selectCols = await this._buildSelectCols();
      if (this._count === 'exact' && !this._head) {
        selectCols = `${selectCols}, count(*) OVER() AS __augre_count`;
      }

      const returningClause = this._returnsData ? `RETURNING ${selectCols}` : '';
      if (this._method === 'SELECT') {
        if (this._head) {
          query = `SELECT count(*) AS __augre_count FROM "${this._schema}"."${this._table}" ${buildWhere()}`;
        } else {
          query = `SELECT ${selectCols} FROM "${this._schema}"."${this._table}" ${buildWhere()}`;

          if (this._order.length > 0) {
            const orderClauses = this._order.map(o => {
              let cl = this._quoteColumn(o.col);

              if (o.options.ascending === false) { cl += ' DESC'; }
              else { cl += ' ASC'; }

              if (o.options.nullsFirst === true) { cl += ' NULLS FIRST'; }
              else if (o.options.nullsFirst === false) { cl += ' NULLS LAST'; }

              return cl;
            });

            query += ` ORDER BY ${orderClauses.join(', ')}`;
          }

          if (this._limit) {
            query += ` LIMIT ${this._limit}`;
          }

          if (this._range) {
            query += ` LIMIT ${this._range.to - this._range.from + 1} OFFSET ${this._range.from}`;
          }
        }
      }
      else if (this._method === 'INSERT' || this._method === 'UPSERT') {
        const dataArr = Array.isArray(this._data) ? this._data : [this._data];
        if (dataArr.length === 0) {
          client.release();
          return { data: [], error: null };
        }

        const cols = Object.keys(dataArr[0] as Record<string, unknown>);
        const colStr = cols.map(c => `"${c}"`).join(', ');

        const valueStrings = dataArr.map(row => {
          const record = row as Record<string, unknown>;
          const rowVals = cols.map(c => {
            values.push(record[c]);
            return `$${paramIndex++}`;
          });

          return `(${rowVals.join(', ')})`;
        });

        query = `INSERT INTO "${this._schema}"."${this._table}" (${colStr}) VALUES ${valueStrings.join(', ')}`;
        if (this._method === 'UPSERT') {
          const conflictCol = this._onConflict || 'id';
          const updateCols = cols.filter(c => c !== conflictCol).map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');

          if (updateCols && !this._ignoreDuplicates) {
            query += ` ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updateCols}`;
          } else {
            query += ` ON CONFLICT ("${conflictCol}") DO NOTHING`;
          }
        }

        query += ` ${returningClause}`;
      }
      else if (this._method === 'UPDATE') {
        const updateData = this._data as Record<string, unknown>;
        const cols = Object.keys(updateData);

        if (cols.length === 0) {
          client.release();
          return { data: [], error: null };
        }

        const setStrings = cols.map(c => {
          values.push(updateData[c]);
          return `"${c}" = $${paramIndex++}`;
        });

        query = `UPDATE "${this._schema}"."${this._table}" SET ${setStrings.join(', ')} ${buildWhere()} ${returningClause}`;
      }
      else if (this._method === 'DELETE') {
        query = `DELETE FROM "${this._schema}"."${this._table}" ${buildWhere()} ${returningClause}`;
      }

      if (this._explain) {
        query = `EXPLAIN (FORMAT JSON) ${query}`;
      }

      if (this._abortSignal && this._abortSignal.aborted) {
        throw new Error('Query cancelled by AbortSignal');
      }

      const queryPromise = client.query(query, values);
      if (this._abortSignal) {
        const abortHandler = () => { };

        this._abortSignal.addEventListener('abort', abortHandler);
        queryPromise.finally(() => this._abortSignal?.removeEventListener('abort', abortHandler));
      }

      const res = await queryPromise;
      if (useTransaction) {
        await client.query('COMMIT');
      }

      let finalData = res.rows;
      if (this._explain) {
        return { data: finalData as unknown, error: null };
      }

      if (!this._returnsData && this._method !== 'SELECT' && !this._head) {
        return { data: null, error: null };
      }

      let count = null;
      if (this._head) {
        count = finalData.length > 0 ? parseInt((finalData[0] as Record<string, unknown>).__augre_count as string, 10) : 0;
        return { data: null as unknown, error: null, count };
      }

      if (this._count === 'exact' && finalData.length > 0) {
        count = parseInt((finalData[0] as Record<string, unknown>).__augre_count as string, 10);
        finalData.forEach(row => delete (row as Record<string, unknown>).__augre_count);
      } else if (!this._count) {
        count = finalData.length;
      } else if (finalData.length === 0) {
        count = 0;
      }

      if (this._single) {
        if (finalData.length === 0) {
          return { data: null, error: new Error('JSON object requested, multiple (or no) rows returned') };
        }

        finalData = finalData[0];
      } else if (this._maybeSingle) {
        if (finalData.length > 1) {
          return { data: null, error: new Error('JSON object requested, multiple rows returned') };
        }

        finalData = finalData.length > 0 ? finalData[0] : null;
      }

      return { data: finalData as unknown, error: null, count };
    } catch (error: unknown) {
      if (useTransaction) {
        await client.query('ROLLBACK');
      }

      return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
    } finally {
      client.release();
    }
  }
}
