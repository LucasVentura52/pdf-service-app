export function resolveReusableSessionTarget({
  maxConcurrentJobs,
  prewarmedSessions,
  reuseSessions,
}) {
  const normalizedMaxConcurrentJobs = Math.max(1, Number(maxConcurrentJobs || 1));
  const normalizedPrewarmedSessions = Math.max(0, Number(prewarmedSessions || 0));
  const baselineTarget = reuseSessions
    ? normalizedPrewarmedSessions > 0
      ? normalizedMaxConcurrentJobs
      : 1
    : 0;

  return Math.min(
    normalizedMaxConcurrentJobs,
    Math.max(normalizedPrewarmedSessions, baselineTarget)
  );
}

export function canUseDefaultSessionPool(options = {}) {
  const allowedAssetOrigins = options.allowedAssetOrigins;
  if (!allowedAssetOrigins) {
    return true;
  }

  for (const _origin of allowedAssetOrigins) {
    return false;
  }

  return true;
}
