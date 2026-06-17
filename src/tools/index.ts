import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { triggerIndex } from "../client.js";

export const indexTool: Tool = {
  name: "testseer_trigger_index",
  description:
    "Trigger an on-demand re-index of a service from GitHub. Publishes an async job — use " +
    "testseer_get_service_status to check when it completes. " +
    "Provide commitSha to index a specific commit, or omit to index HEAD.",
  inputSchema: {
    type: "object",
    properties: {
      serviceId: { type: "string", description: "TestSeer serviceId" },
      commitSha: { type: "string", description: "Optional commit SHA. Defaults to HEAD." },
    },
    required: ["serviceId"],
  },
};

export async function handleIndex(args: Record<string, string>) {
  const { serviceId, commitSha } = args;
  if (!serviceId) {
    return {
      content: [{ type: "text" as const, text: "serviceId required" }],
      isError: true,
    };
  }

  try {
    const { data: result } = await triggerIndex(serviceId, commitSha);
    return {
      content: [
        {
          type: "text" as const,
          text: `Index job queued.\n${JSON.stringify(result, null, 2)}\n\nUse testseer_get_service_status to check progress.`,
        },
      ],
    };
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: `Error: ${err}` }],
      isError: true,
    };
  }
}
