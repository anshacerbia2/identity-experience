// js-yaml 4 ships no types, and only its load is used, by the contract test
// (src/api/identity-control-contract.test.ts). Declared here rather than taking @types/js-yaml.
declare module 'js-yaml' {
  export function load(text: string): unknown;
}
