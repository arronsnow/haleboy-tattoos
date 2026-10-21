// Minimal types for the node:sqlite API used by tests (the project has no @types/node).
declare module 'node:sqlite' {
  interface Statement {
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
    run(...args: unknown[]): unknown;
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): Statement;
  }
}
