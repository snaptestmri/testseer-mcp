/** Shared defaults from environment (set in Cursor MCP config or shell). */
export function envOrgId(): string | undefined {
  const value = process.env.TESTSEER_ORG_ID?.trim();
  return value || undefined;
}

export function envTraceShortId(): string | undefined {
  const value = process.env.TESTSEER_TRACE_SHORT_ID?.trim();
  return value || undefined;
}

export function envTraceEnv(): string {
  return process.env.TESTSEER_TRACE_ENV?.trim() || "pdn";
}

export function requireOrgId(explicit?: string): string | { error: string } {
  const orgId = explicit?.trim() || envOrgId();
  if (!orgId) {
    return {
      error:
        "orgId is required. Pass orgId or set TESTSEER_ORG_ID in MCP env (from config/workspace.yml defaultOrgId).",
    };
  }
  return orgId;
}
