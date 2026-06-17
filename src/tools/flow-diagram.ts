import { get } from "../client.js";

export const serviceFlowDiagramTool = {
  name: "testseer_get_service_flow_diagram",
  description:
    "Composed service flow diagram (BL-054): ingress → orchestration → processor fan-out → messaging exits. " +
    "Returns JSON nodes/edges/gaps or Mermaid when format=mermaid. " +
    "Anchor: triggerId:|handlerFqn:|symbolFqn:|nodeId:",
  inputSchema: {
    type: "object" as const,
    properties: {
      serviceId: { type: "string", description: "Registered service ID (required)" },
      anchor: {
        type: "string",
        description:
          "Diagram anchor, e.g. handlerFqn:com.example.Consumer.onMessage or triggerId:kafka:...",
      },
      orgId: { type: "string", description: "Organisation id (default quotient)" },
      packagePrefix: {
        type: "string",
        description: "Java package prefix to scope consumer module",
      },
      depth: { type: "string", description: "Transitive expansion depth (default 6)" },
      includeMessaging: { type: "string", description: "true to include Kafka/PubSub egress (default true)" },
      includeExternalDomain: { type: "string", description: "true to include suite helpers (default true)" },
      includeGates: { type: "string", description: "true to attach gate metadata (default true)" },
      format: { type: "string", description: "json (default) or mermaid" },
    },
    required: ["serviceId", "anchor"],
  },
};

export async function handleServiceFlowDiagram(args: Record<string, string>) {
  const { serviceId, anchor } = args;
  if (!serviceId || !anchor) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: "serviceId and anchor are required" }],
    };
  }

  const params = new URLSearchParams({
    serviceId,
    anchor,
    orgId: args.orgId ?? "quotient",
  });
  if (args.packagePrefix) params.set("packagePrefix", args.packagePrefix);
  if (args.depth) params.set("depth", args.depth);
  if (args.includeMessaging) params.set("includeMessaging", args.includeMessaging);
  if (args.includeExternalDomain) params.set("includeExternalDomain", args.includeExternalDomain);
  if (args.includeGates) params.set("includeGates", args.includeGates);
  if (args.format) params.set("format", args.format);

  try {
    const { data } = await get<{ data: unknown }>(
      `/v1/graph/flow-diagram?${params.toString()}`,
      "testseer_get_service_flow_diagram"
    );
    const payload = (data as { data?: unknown }).data ?? data;
    const mermaid =
      typeof payload === "object" &&
      payload !== null &&
      "mermaid" in payload &&
      typeof (payload as { mermaid?: string }).mermaid === "string"
        ? (payload as { mermaid: string }).mermaid
        : null;

    const summary =
      typeof payload === "object" && payload !== null && "stats" in payload
        ? `nodes=${(payload as { stats?: { nodeCount?: number } }).stats?.nodeCount ?? "?"} ` +
          `edges=${(payload as { stats?: { edgeCount?: number } }).stats?.edgeCount ?? "?"}`
        : "";

    return {
      content: [
        {
          type: "text" as const,
          text: mermaid
            ? `Service flow diagram (Mermaid)\n${summary}\n\n${mermaid}`
            : `Service flow diagram\n${summary}\n\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: `Error: ${err}` }],
    };
  }
}
