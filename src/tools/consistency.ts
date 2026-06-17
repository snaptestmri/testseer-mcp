import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getConsistencyScenarios } from "../client.js";

export const consistencyScenariosTool: Tool = {
  name: "testseer_get_consistency_scenarios",
  description:
    "Query static consistency scenarios for a service (dual-write, async mirror, rule pack seeds). " +
    "Use during trace triage to see authoritative store, correlation keys, and poll order.",
  inputSchema: {
    type: "object",
    properties: {
      serviceId: { type: "string", description: "Registered service ID" },
      pattern: {
        type: "string",
        description: "Filter by pattern e.g. DUAL_WRITE, ASYNC_MIRROR",
      },
      flowStep: { type: "string", description: "Filter by flow step label from rule pack" },
    },
    required: ["serviceId"],
  },
};

export async function handleConsistencyScenarios(args: Record<string, string>) {
  const { serviceId, pattern, flowStep } = args;
  if (!serviceId) {
    return {
      content: [{ type: "text" as const, text: "serviceId is required." }],
      isError: true,
    };
  }

  try {
    const params = new URLSearchParams({ serviceId });
    if (pattern) params.set("pattern", pattern);
    if (flowStep) params.set("flowStep", flowStep);
    const { data: envelope } = await getConsistencyScenarios(params.toString());

    if (envelope.freshnessStatus === "NOT_INDEXED") {
      return {
        content: [
          { type: "text" as const, text: `Service ${serviceId} has not been indexed.` },
        ],
        isError: true,
      };
    }

    const lines = [
      `## Consistency scenarios — ${serviceId}`,
      `Count: **${envelope.data?.length ?? 0}**`,
    ];
    for (const s of envelope.data ?? []) {
      lines.push(
        `- **${s.scenarioId}** (${s.pattern}) store=${s.primaryStore}/${s.primaryPhysical} conf=${s.confidence}`
      );
    }

    return {
      content: [
        { type: "text" as const, text: lines.join("\n") },
        { type: "text" as const, text: "\nFull JSON:\n" + JSON.stringify(envelope.data, null, 2) },
      ],
    };
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: `Error: ${err}` }],
      isError: true,
    };
  }
}
