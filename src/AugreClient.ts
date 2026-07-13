import { Pool } from 'pg';
import type { PoolConfig } from 'pg';
import type { AuthContext } from './AuthContext.js';
import { QueryBuilder } from './QueryBuilder.js';
import { RpcBuilder } from './RpcBuilder.js';
import { Channel } from './Channel.js';

export class AugreClient<Database = unknown> {
  public pool: Pool;
  private _auth?: AuthContext;
  private _schema = 'public';

  constructor(connectionStringOrConfig: string | PoolConfig) {
    if (typeof connectionStringOrConfig === 'string') {
      this.pool = new Pool({ connectionString: connectionStringOrConfig });
    } else {
      this.pool = new Pool(connectionStringOrConfig);
    }
  }

  auth(context: AuthContext): AugreClient<Database> {
    const client = new AugreClient<Database>({} as PoolConfig);
    client.pool = this.pool;
    client._auth = context;
    client._schema = this._schema;

    return client;
  }

  schema<SchemaName extends string>(name: SchemaName): AugreClient<Database> {
    const client = new AugreClient<Database>({} as PoolConfig);
    client.pool = this.pool;

    if (this._auth !== undefined) {
      client._auth = this._auth;
    }

    client._schema = name;
    return client;
  }

  from<TableName extends string>(table: TableName) {
    type Schema = Database extends { public: { Tables: infer T } } ? T : any;
    type TableDef = TableName extends keyof Schema ? Schema[TableName] : any;
    type Row = TableDef extends { Row: infer R } ? R : any;
    type Insert = TableDef extends { Insert: infer I } ? I : any;
    type Update = TableDef extends { Update: infer U } ? U : any;

    return new QueryBuilder<Row, Insert, Update>(this.pool, table, this._schema, this._auth);
  }

  rpc<FunctionName extends string>(fn: FunctionName, args?: Record<string, unknown>) {
    return new RpcBuilder(this.pool, fn, args, this._schema, this._auth);
  }

  channel(name: string) {
    return new Channel(this.pool, name);
  }
}
