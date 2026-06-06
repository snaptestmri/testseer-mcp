import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { listServices, getServiceStatus, getServiceDescription } from "../client.js";

export const serviceTools: Tool[] = [
  {
    name: "testseer_list_services",
    description:
      "List all services registered in TestSeer. Returns serviceId, orgId, repo, serviceName, buildTool, and enabled status for each.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "testseer_get_service_status",
    description:
      "Get the indexing freshness status for a service: CURRENT, STALE, INDEXING, or NOT_INDEXED. Also returns the last indexed commit SHA and timestamp.",
    inputSchema: {
      type: "object",
      properties: {
        serviceId: { type: "string", description: "TestSeer serviceId" },
      },
      required: ["serviceId"],
    },
  },
  {
    name: "testseer_get_service_description",
    description:
      "Get the LLM-generated plain-English business description for a service, derived from its indexed Javadoc, method signatures, and state machine enums. Requires ANTHROPIC_ENABLED=true on the server.",
    inputSchema: {
      type: "object",
      properties: {
        serviceId: { type: "string", description: "TestSeer serviceId" },
      },
      required: ["serviceId"],
    },
  },
];

export async function handleServiceTool(name: string, args: Record<string, string>) {
  try {
    switch (name) {
      case "testseer_list_services": {
        const services = await listServices();
        const lines = services.map(
          (s) =>
            `- **${s.serviceName}** (${s.serviceId}) — ${s.orgId}/${s.repo} [${s.buildTool}] ${s.enabled ? "✓" : "disabled"}`
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `## Registered services (${services.length})\n\n${lines.join("\n")}`,
            },
            {
              type: "text" as const,
              text: "\nFull JSON:\n" + JSON.stringify(services, null, 2),
            },
          ],
        };
      }

      case "testseer_get_service_status": {
        const { serviceId } = args;
        if (!serviceId) {
          return {
            content: [{ type: "text" as const, text: "serviceId required" }],
            isError: true,
          };
        }
        const envelope = await getServiceStatus(serviceId);
        const text = `Service: ${serviceId}\nStatus: **${envelope.freshnessStatus}**\nLast indexed: ${envelope.indexedAt ?? envelope.data?.indexedAt ?? "never"}\nCommit: ${envelope.commitSha ?? envelope.data?.commitSha ?? "unknown"}`;
        return { content: [{ type: "text" as const, text }] };
      }

      case "testseer_get_service_description": {
        const { serviceId } = args;
        if (!serviceId) {
          return {
            content: [{ type: "text" as const, text: "serviceId required" }],
            isError: true,
          };
        }
        const description = await getServiceDescription(serviceId);
        return {
          content: [{ type: "text" as const, text: `## Business Description\n\n${description}` }],
        };
      }

      default:
        return {
          content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: `Error: ${err}` }],
      isError: true,
    };
  }
}
