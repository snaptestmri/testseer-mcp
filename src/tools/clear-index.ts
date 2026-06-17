import { clearIndex } from "../client.js";
import { requireOrgId } from "../env-defaults.js";

export const clearIndexTool = {
  name: "testseer_clear_index",
  description:
    "Clear indexed facts before a clean re-index. " +
    "scope=SERVICE (all facts), MESSAGING (Option C facts only), ORG (entire org).",
  inputSchema: {
    type: "object" as const,
    properties: {
      scope: {
        type: "string",
        description: "SERVICE | MESSAGING | ORG (default SERVICE)",
      },
      serviceId: { type: "string", description: "Required for SERVICE or MESSAGING scope" },
      orgId: { type: "string", description: "Required for ORG scope (or TESTSEER_ORG_ID env)" },
      includeRegistry: {
        type: "boolean",
        description: "When scope=ORG, also delete service_registry rows",
      },
    },
    required: [],
  },
};

export async function handleClearIndex(args: Record<string, string>) {
  const scope = (args.scope ?? "SERVICE").toUpperCase();
  const body: Record<string, unknown> = { scope };

  if (scope === "ORG") {
    const orgResult = requireOrgId(args.orgId);
    if (typeof orgResult !== "string") {
      return {
        content: [{ type: "text" as const, text: orgResult.error }],
        isError: true,
      };
    }
    body.orgId = orgResult;
    body.includeRegistry = args.includeRegistry === "true";
  } else {
    if (!args.serviceId) {
      return {
        content: [{ type: "text" as const, text: "serviceId is required for SERVICE or MESSAGING scope" }],
        isError: true,
      };
    }
    body.serviceId = args.serviceId;
  }

  const { data } = await clearIndex(body);
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
