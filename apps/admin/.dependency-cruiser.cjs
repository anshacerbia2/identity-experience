// Module boundaries of the Identity Admin Portal, enforced (STD-GLB-FE-001 §3, §5). The layers:
//
//   domain/      pure TypeScript: no React, no styles, no IO
//   core/        this application's message catalogue
//   features/    one folder per surface; a feature never imports another
//   routes/      thin files that hand a path to a feature
//   app/         the composition root
//
// API access, the session, the query client, preferences, the frame every page renders in, and the
// domain the applications share come from @identity-experience/app-core. Its domain modules are
// domain here too.
//
// Components come from @identity-experience/ui and nowhere else. That package is the stand-in for
// @scnx/system, and its exports field exposes only its entry point, so no file here can reach
// into its internals; replacing it is changing the package, not these files.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-feature-imports',
      comment: 'A feature never imports another feature (STD-GLB-FE-001 §3).',
      severity: 'error',
      from: { path: '^src/features/([^/]+)/' },
      to: { path: '^src/features/([^/]+)/', pathNot: '^src/features/$1/' },
    },
    {
      name: 'domain-is-pure',
      comment: 'domain/ depends on nothing but other domain modules, its own or the shared core’s.',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { pathNot: '^src/domain/|app-core/(src/)?domain/' },
    },
    {
      name: 'core-does-not-reach-up',
      comment: 'core/ serves features; it never imports them, a route, or the application.',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/(features|routes|app)/' },
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
    exclude: { path: '(^src/routeTree\\.gen\\.ts$|\\.test\\.tsx?$|^src/test/)' },
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { extensions: ['.ts', '.tsx', '.js'] },
  },
};
