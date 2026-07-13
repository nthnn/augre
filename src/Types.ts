type Whitespace = ' ' | '\n' | '\t';
export type Trim<S extends string> =
  S extends `${Whitespace}${infer T}` ? Trim<T> :
  S extends `${infer T}${Whitespace}` ? Trim<T> :
  S;

export type Split<S extends string, D extends string> =
  string extends S ? string[] :
  S extends '' ? [] :
  S extends `${infer T}${D}${infer U}` ? [T, ...Split<U, D>] : [S];

export type ParseSelect<T extends string> = Trim<Split<T, ','>[number]>;

export type GetResult<SchemaRow, SelectString extends string> = 
  string extends SelectString 
    ? SchemaRow 
    : SelectString extends '*' 
      ? SchemaRow 
      : Pick<SchemaRow, Extract<ParseSelect<SelectString>, keyof SchemaRow>>;

export interface GenericTable {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
}

export interface GenericSchema {
  Tables: Record<string, GenericTable>;
  Views?: Record<string, GenericTable>;
}

export interface GenericDatabase {
  [schema: string]: GenericSchema;
}

export type QueryResult<T> = {
  data: T | null;
  error: Error | null;
  count?: number | null;
};
