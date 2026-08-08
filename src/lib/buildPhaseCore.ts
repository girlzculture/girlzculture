export type BuildPhaseEnvironment = {
  [key: string]: string | undefined;
  NEXT_PHASE?: string;
  npm_lifecycle_event?: string;
};

/**
 * Static generation may read production-backed public content, but it must never
 * create operational incidents in that database. Runtime requests do not carry
 * npm's build lifecycle value and Next only uses this phase while compiling.
 */
export function isStaticBuildPhase(
  environment: BuildPhaseEnvironment = process.env,
) {
  return (
    environment.NEXT_PHASE === "phase-production-build" ||
    environment.npm_lifecycle_event === "build"
  );
}
