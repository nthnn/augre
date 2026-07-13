import { Pool } from 'pg';

export type ForeignKey = {
  table_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
};

export class SchemaCache {
  private static fks: ForeignKey[] | null = null;
  private static promise: Promise<ForeignKey[]> | null = null;

  static async getForeignKeys(pool: Pool): Promise<ForeignKey[]> {
    if (this.fks) {
      return this.fks;
    }

    if (this.promise) {
      return this.promise;
    }

    this.promise = pool.query(`
      SELECT
          tc.table_name, 
          kcu.column_name, 
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name 
      FROM 
          information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY';
    `).then(res => {
      this.fks = res.rows;
      return this.fks;
    });

    return this.promise;
  }
}
