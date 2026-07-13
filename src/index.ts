import { AugreClient } from './AugreClient.js';

export function createClient<Database = unknown>(connectionString: string): AugreClient<Database> {
  return new AugreClient<Database>(connectionString);
}

export { AugreClient } from './AugreClient.js';
export * from './Types.js';
export * from './QueryBuilder.js';
export * from './FilterBuilder.js';
