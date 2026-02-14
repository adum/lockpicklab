declare module "fs";
declare module "path";
declare module "node:test" {
  const test: any;
  export default test;
  export const describe: any;
  export const it: any;
  export const before: any;
  export const after: any;
  export const beforeEach: any;
  export const afterEach: any;
}
declare module "node:assert/strict" {
  const assert: any;
  export = assert;
}

declare const process: {
  argv: string[];
};
