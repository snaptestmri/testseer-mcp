export const MCP_CLIENT = "testseer-mcp/1.0.0";
export const LOG_LEVEL = (process.env.TESTSEER_MCP_LOG ?? "info").toLowerCase();

export interface ToolCallLog {
  tool: string;
  requestId: string;
  durationMs: number;
  backendStatus?: number;
  freshnessStatus?: string;
  serviceId?: string;
  error?: string | null;
}

export function logToolCall(entry: ToolCallLog): void {
  if (LOG_LEVEL === "off") return;

  const payload = {
    ts: new Date().toISOString(),
    level: entry.error ? "error" : "info",
    component: "testseer-mcp",
    event: "tool_call",
    tool: entry.tool,
    requestId: entry.requestId,
    durationMs: entry.durationMs,
    backendStatus: entry.backendStatus ?? null,
    freshnessStatus: entry.freshnessStatus ?? null,
    serviceId: entry.serviceId ?? null,
    error: entry.error ?? null,
  };

  console.error(JSON.stringify(payload));
}

export async function withToolObservability<T>(
  tool: string,
  fn: () => Promise<T>
): Promise<T> {
  const requestId = crypto.randomUUID();
  const start = Date.now();
  try {
    const result = await fn();
    logToolCall({ tool, requestId, durationMs: Date.now() - start, error: null });
    return result;
  } catch (err) {
    logToolCall({
      tool,
      requestId,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
