import { getContractEntryFlow, getContractGaps, getContractOperations, getContractSchemas, getContractTestCoverageGaps } from "../client.js";

export const contractOperationsTool = {
  name: "testseer_get_contract_operations",
  description:
    "Query partner API contract operations indexed from riq-platform-apis-optimus OpenAPI specs. " +
    "Filter by catalog library serviceId or implementing serviceId; optional specDomain (Offers, Rebate, etc.).",
  inputSchema: {
    type: "object" as const,
    properties: {
      serviceId: { type: "string", description: "Catalog or implementing service ID" },
      specDomain: { type: "string", description: "OpenAPI domain e.g. Offers, Rebate" },
    },
    required: ["serviceId"],
  },
};

export const contractGapsTool = {
  name: "testseer_get_contract_gaps",
  description:
    "Reconcile OpenAPI contract operations vs indexed inbound REST handlers. " +
    "Returns CONTRACT_ONLY (documented, not implemented) and IMPLEMENTATION_ONLY (handler, not in contract).",
  inputSchema: {
    type: "object" as const,
    properties: {
      serviceId: { type: "string", description: "Implementing or catalog service ID" },
      specDomain: { type: "string", description: "Optional OpenAPI domain filter" },
    },
    required: ["serviceId"],
  },
};

export const contractSchemasTool = {
  name: "testseer_get_contract_schemas",
  description:
    "Query JSON schema summaries from riq-platform-apis-optimus including nested field paths.",
  inputSchema: {
    type: "object" as const,
    properties: {
      serviceId: { type: "string", description: "Catalog library service ID" },
      schemaId: { type: "string", description: "Optional schema file path/id filter" },
    },
    required: ["serviceId"],
  },
};

export const contractTestCoverageGapsTool = {
  name: "testseer_get_contract_test_coverage_gaps",
  description:
    "Reconcile OpenAPI contract operations vs REST-Assured test HTTP calls indexed from riq-qa-REST-Assured.",
  inputSchema: {
    type: "object" as const,
    properties: {
      serviceId: { type: "string", description: "Implementing service ID" },
      testServiceId: { type: "string", description: "Optional REST-Assured suite service ID" },
      specDomain: { type: "string", description: "Optional OpenAPI domain filter" },
    },
    required: ["serviceId"],
  },
};

export const contractEntryFlowTool = {
  name: "testseer_trace_contract_entry_flow",
  description:
    "Trace from an OpenAPI contract operation to the implementing service inbound handler and entry-flow " +
    "(data access + flow gates). Provide operationId or httpMethod + path.",
  inputSchema: {
    type: "object" as const,
    properties: {
      serviceId: { type: "string", description: "Catalog or implementing service ID" },
      operationId: { type: "string", description: "Contract operationId from contract-operations" },
      specDomain: { type: "string", description: "Optional domain filter when resolving by path" },
      httpMethod: { type: "string", description: "HTTP method when resolving by path" },
      path: { type: "string", description: "Path template e.g. /offers/redeem" },
      env: { type: "string", description: "Env lane for entry-flow trace (default unknown)" },
    },
    required: ["serviceId"],
  },
};

export async function handleContractOperations(args: Record<string, string>) {
  const params = new URLSearchParams({ serviceId: args.serviceId });
  if (args.specDomain) params.set("specDomain", args.specDomain);
  const { data } = await getContractOperations(params.toString());
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export async function handleContractGaps(args: Record<string, string>) {
  const params = new URLSearchParams({ serviceId: args.serviceId });
  if (args.specDomain) params.set("specDomain", args.specDomain);
  const { data } = await getContractGaps(params.toString());
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export async function handleContractSchemas(args: Record<string, string>) {
  const params = new URLSearchParams({ serviceId: args.serviceId });
  if (args.schemaId) params.set("schemaId", args.schemaId);
  const { data } = await getContractSchemas(params.toString());
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export async function handleContractTestCoverageGaps(args: Record<string, string>) {
  const params = new URLSearchParams({ serviceId: args.serviceId });
  if (args.testServiceId) params.set("testServiceId", args.testServiceId);
  if (args.specDomain) params.set("specDomain", args.specDomain);
  const { data } = await getContractTestCoverageGaps(params.toString());
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export async function handleContractEntryFlow(args: Record<string, string>) {
  const params = new URLSearchParams({ serviceId: args.serviceId });
  if (args.operationId) params.set("operationId", args.operationId);
  if (args.specDomain) params.set("specDomain", args.specDomain);
  if (args.httpMethod) params.set("httpMethod", args.httpMethod);
  if (args.path) params.set("path", args.path);
  if (args.env) params.set("env", args.env);
  const { data } = await getContractEntryFlow(params.toString());
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
