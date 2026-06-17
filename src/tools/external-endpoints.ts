import { getExternalEndpoints } from "../client.js";

export const externalEndpointsTool = {
  name: "testseer_get_external_endpoints",
  description:
    "Query indexed external/partner HTTP endpoints for a service (Hyvee LMS, OIS callbacks, etc.). " +
    "Returns config-resolved URLs per env lane with caller/client class linkage.",
  inputSchema: {
    type: "object" as const,
    properties: {
      serviceId: { type: "string", description: "Registered service ID" },
      env: { type: "string", description: "Env lane: pdn, qa, prod" },
      partner: { type: "string", description: "Partner slug e.g. hyvee, quotient" },
      flowStep: { type: "string", description: "Flow step e.g. HYVEE_ADAPTER" },
    },
    required: ["serviceId"],
  },
};

export async function handleExternalEndpoints(args: Record<string, string>) {
  const params = new URLSearchParams({ serviceId: args.serviceId });
  if (args.env) params.set("env", args.env);
  if (args.partner) params.set("partner", args.partner);
  if (args.flowStep) params.set("flowStep", args.flowStep);
  const { data } = await getExternalEndpoints(params.toString());
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
