# Augre

[![Augre Build Pipeline](https://github.com/nthnn/augre/actions/workflows/ci.yml/badge.svg)](https://github.com/nthnn/augre/actions/workflows/ci.yml)

**Augre** is a powerful, drop-in replacement for Supabase's `postgrest-js` database SDK. It allows you to use the familiar, fluent, and strongly-typed Supabase API directly against **any raw PostgreSQL database** via a standard connection string. 

No PostgREST middleware. No API server overhead. Just pure, direct, strictly-typed SQL querying using the elegant Supabase syntax you already love.

---

## Installation

```bash
npm install augre pg
npm install -D @types/pg
```

---

## Quickstart

```typescript
import { AugreClient } from 'augre';

// Initialize the client directly with a Postgres connection string
const augre = new AugreClient({
  connectionString: 'postgres://user:password@localhost:5432/mydb'
});

// Fetch strictly typed data
const { data, error } = await augre
  .from('users')
  .select('id, name, email')
  .eq('status', 'active')
  .limit(10);

if (error) console.error(error);
console.log(data); // data[0].email seamlessly resolves!
```

---

## Why Augre?

- **Zero Middleware:** Communicate directly with PostgreSQL using the heavily-optimized `pg` driver.
- **Supabase Parity:** 99% syntax compatibility with Supabase SDK. Easily migrate away from cloud-hosted PostgREST without rewriting your app.
- **Magical Typing:** Augre replicates Supabase's exact TypeScript DX. The `select('email, name')` string is parsed at compile-time to automatically strict-type the returned data keys.
- **Row Level Security (RLS) Compatible:** Use the built-in `.auth()` transaction wrapper to execute queries under specific roles and `request.jwt.claim.sub` contexts.
- **Relational Subqueries:** Seamlessly resolve nested foreign key objects (e.g., `select('title, author(name)')`).

---

## Comprehensive API Documentation

### 1. Initializing the Client

You can optionally pass a global `Database` schema to get 100% strict type checking on values, or omit it to rely on seamless generic inference.

```typescript
// Strongly typed instantiation (Optional but recommended)
interface Database {
  public: {
    Tables: {
      users: {
        Row: { id: number; name: string; email: string };
        Insert: { name: string; email: string };
        Update: { name?: string; email?: string };
      };
    };
  };
}

const augre = new AugreClient<Database>({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Required for some cloud hosts like Aiven/Heroku
});
```

#### Switching Schemas
By default, queries run against the `public` schema. Use `.schema()` to query tables in a different PostgreSQL schema.

```typescript
const { data } = await augre
  .schema('auth')
  .from('users')
  .select('id, email');
```

### 2. Fetching Data (`SELECT`)

Augre supports standard selects, Postgres casting, aliases, and complex foreign key relations.

```typescript
// Basic Select
await augre.from('users').select('*');

// Specific columns
await augre.from('users').select('name, email');

// Aliasing (rename column in output)
await augre.from('users').select('name, my_email:email');

// PostgreSQL Type Casting
await augre.from('users').select('id::text, created_at');

// Relational Deep Querying (Foreign Keys)
// Automatically builds a dynamic row_to_json subquery
await augre.from('posts').select('title, users(name, email)');
```

### 3. Inserting Data (`INSERT`)

By default, mutations return `null` data to save bandwidth. Chain `.select()` to return the inserted rows.

```typescript
// Insert a single row
const { error } = await augre.from('users').insert({ name: 'Alice', email: 'alice@test.com' });

// Insert multiple rows & return inserted data
const { data, error } = await augre
  .from('users')
  .insert([
    { name: 'Bob', email: 'bob@test.com' },
    { name: 'Charlie', email: 'charlie@test.com' }
  ])
  .select(); // Required to populate 'data'
```

### 4. Updating Data (`UPDATE`)

Updates require a filter.

```typescript
const { data } = await augre
  .from('users')
  .update({ status: 'inactive' })
  .eq('id', 1)
  .select();
```

### 5. Upserting Data (`UPSERT`)

Insert rows, or update them if a primary key or unique constraint conflicts.

```typescript
await augre
  .from('users')
  .upsert(
    { id: 1, name: 'Alice Updated' }, 
    { onConflict: 'id' } // Specify the unique column to check
  );
```

### 6. Deleting Data (`DELETE`)

```typescript
await augre
  .from('posts')
  .delete()
  .lt('views', 10);
```

---

## Filters & Operators

Augre supports the entire suite of PostgREST filters.

| Method | SQL Equivalent | Example |
| :--- | :--- | :--- |
| `.eq()` | `=` | `.eq('status', 'active')` |
| `.neq()` | `!=` | `.neq('role', 'admin')` |
| `.gt()` | `>` | `.gt('age', 18)` |
| `.gte()` | `>=` | `.gte('age', 18)` |
| `.lt()` | `<` | `.lt('price', 100)` |
| `.lte()` | `<=` | `.lte('price', 100)` |
| `.like()` | `LIKE` | `.like('name', '%Doe%')` |
| `.ilike()` | `ILIKE` | `.ilike('name', '%doe%')` |
| `.is()` | `IS` | `.is('deleted_at', null)` |
| `.in()` | `IN` | `.in('status', ['active', 'pending'])` |
| `.contains()` | `@>` | `.contains('tags', ['typescript'])` |
| `.containedBy()` | `<@` | `.containedBy('tags', ['javascript', 'typescript'])` |
| `.overlaps()` | `&&` | `.overlaps('available_days', ['monday', 'friday'])` |

#### Object Matching (`.match()`)
Easily apply multiple equality filters via an object.
```typescript
await augre
  .from('users')
  .select('*')
  .match({ status: 'active', role: 'admin' });
```

#### Range Filters
For working with PostgreSQL range types (e.g., `int4range`, `tsrange`).
- `.rangeGt(column, value)` (`>>`)
- `.rangeGte(column, value)` (`&>`)
- `.rangeLt(column, value)` (`<<`)
- `.rangeLte(column, value)` (`&<`)
- `.rangeAdjacent(column, value)` (`-|-`)

#### Full Text Search (`.textSearch()`)
Leverage native Postgres text search using `to_tsvector()` and `to_tsquery()`.
```typescript
await augre
  .from('articles')
  .select('*')
  .textSearch('content', 'typescript & postgres');
```

#### Advanced JSON Filters
Query deeply nested JSONB data effortlessly:
```typescript
await augre
  .from('users')
  .select('*')
  .eq('metadata->>role', 'admin');
```

#### Logical Operators (`.or()`, `.not()`)
```typescript
// OR statement
await augre
  .from('users')
  .select('*')
  .or('age.gt.18,status.eq.active'); // Syntactic equivalent to PostgREST

// NOT statement
await augre
  .from('users')
  .select('*')
  .not('status', 'eq', 'banned');
```

---

## Modifiers

Chain modifiers to manipulate the shape and limits of your returned data.

#### `.order()`
```typescript
await augre
  .from('users')
  .select('*')
  .order('created_at', { ascending: false, nullsFirst: false });
```

#### `.limit()` & `.range()`
```typescript
await augre.from('posts').select('*').limit(5);

// Pagination
await augre.from('posts').select('*').range(0, 9); // Fetches first 10 rows
```

#### `.single()` & `.maybeSingle()`
Forces the `data` payload to return an object instead of an array.
```typescript
// Throws an error if 0 or >1 rows are found
const { data } = await augre.from('users').select('*').eq('id', 1).single();

// Returns null if 0 rows are found, throws error if >1 rows
const { data } = await augre.from('users').select('*').eq('id', 999).maybeSingle();
```

#### `.csv()`
Returns the query result formatted as a raw CSV string.
```typescript
const csvString = await augre.from('users').select('*').csv();
```

#### `.explain()`
Need to debug query performance? Returns the native PostgreSQL `EXPLAIN (FORMAT JSON)` output for the generated query instead of the raw data.
```typescript
const { data: queryPlan } = await augre
  .from('users')
  .select('*')
  .eq('status', 'active')
  .explain();

console.log(queryPlan); // Outputs Postgres execution plan
```

#### Count Configurations
```typescript
// Return the exact count alongside the data
const { data, count } = await augre.from('users').select('*', { count: 'exact' });

// Return ONLY the count (doesn't fetch rows)
const { count } = await augre.from('users').select('*', { count: 'exact', head: true });
```

---

## Row Level Security (RLS) Wrapper

If you migrate from Supabase to a raw PostgreSQL server, you lose the API gateway that naturally injects JWT claims. **Augre solves this natively.**

Wrap your queries in `.auth()` to execute them inside a dedicated PostgreSQL `BEGIN...COMMIT` transaction block that securely injects local configuration variables.

```typescript
const { data, error } = await augre
  .auth({ 
    user_id: '123e4567-e89b-12d3-a456-426614174000', 
    role: 'authenticated' 
  })
  .from('secrets')
  .select('*');
```
*Behind the scenes, Augre translates this to:*
```sql
BEGIN;
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '123e4567-e89b-12d3-a456-426614174000', true);
SELECT * FROM "public"."secrets";
COMMIT;
```
This guarantees your PostgreSQL RLS policies behave *exactly* as they did in Supabase!

---

## Stored Procedures (RPC)

PostgreSQL stored procedures and functions can be seamlessly executed using `.rpc()`. Augre automatically parameterizes the arguments (`$1, $2`) to prevent SQL injection and properly maps them to the function signature using named variables (`"arg_name" := $1`).

```typescript
// Call a function that takes arguments
const { data, error } = await augre.rpc('increment_score', { 
  u_id: 1, 
  points_to_add: 10 
});

// Call a function that requires no arguments
const { data: stats } = await augre.rpc('get_system_stats');
```

If you specify an `.auth()` context, the RPC call will safely execute within that transaction context, allowing your stored procedures to respect RLS configurations!

---

## Realtime Subscriptions (LISTEN/NOTIFY)

Subscribe to PostgreSQL `pg_notify` channels natively.
```typescript
const channel = augre.channel('system_updates');

channel.on('postgres_changes', {}, (payload) => {
  console.log('Received notification payload:', payload);
});

await channel.subscribe((status) => {
  console.log('Channel status:', status); // "SUBSCRIBED"
});
```

---

## Architecture & Performance
- **Connection Pooling:** Augre requires a single `pg.Pool` instance and optimally shares connections across queries.
- **SQL Injection Prevention:** Every identifier (table, column) and value is strictly routed through native PostgreSQL parameterized queries (`$1`, `$2`) to guarantee complete security.
- **Relational Resolving:** Relational selects do not trigger N+1 queries. The `SchemaCache` analyzes table foreign keys and compiles highly optimized `row_to_json` subqueries directly into the parent SQL query.

---

> Built with strict TypeScript to redefine how we query Postgres. No ORM required.
