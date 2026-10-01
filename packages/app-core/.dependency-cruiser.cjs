// Module boundaries of the shared application core (STD-GLB-FE-001 §3, §5). Every application in
// this repository takes its API access, session, preferences and shared domain from here:
//
//   domain/      pure TypeScript: no React, no styles, no IO
//   everything else serves an application and never reaches into one
//
// A module here imports another module here, @identity-experience/ui, and its peer libraries. It
// never imports an application: a shared piece that needs one application's string or route is
// that application's, not this package's.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      comment: 'domain/ depends on nothing but other domain modules.',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { pathNot: '^src/domain/' },
    },
    {
      name: 'no-application-imports',
      comment: 'The shared core never imports an application.',
      severity: 'error',
      from: {},
      to: { path: 'apps/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(\\.test\\.tsx?$|^src/test/)' },
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { extensions: ['.ts', '.tsx', '.js'] },
  },
};
