import { getCrossRepoEventFlow, getEventFlow, getFlowGates, getPubSubInventory } from "../client.js";
import { envTraceEnv, envTraceShortId, requireOrgId } from "../env-defaults.js";
import {
  formatMessagingFullJson,
  formatPubSubInventoryResponse,
  formatTraceTopicFlowResponse,
  type CrossRepoReport,
  type PubSubResourceRow,
  type ResponseEnvelope,
  type SingleServiceReport,
} from "./messaging-format.js";

export const pubsubInventoryTool = {
  name: "testseer_get_pubsub_inventory",
  description:
    "Query indexed Pub/Sub topics and subscriptions for a service (Option C-P1). " +
    "Filter by env lane (pdn/qa/prod), shortId, or role (PUBLISH/SUBSCRIBE). " +
    "Set liveVerify=true to check subscription existence and topic attach in GCP (requires PUBSUB_LIVE_VERIFY + credentials on backend).",
  inputSchema: {
    type: "object" as const,
    properties: {
      serviceId: { type: "string", description: "Registered service ID" },
      env: { type: "string", description: "Env lane: pdn, qa, prod" },
      shortId: { type: "string", description: "Topic/sub short id e.g. PDN_T.OFFER_UPDATE" },
      role: { type: "string", description: "PUBLISH or SUBSCRIBE" },
      liveVerify: {
        type: "boolean",
        description: "When true, overlay live GCP subscription verification (MSG-10)",
      },
    },
    required: ["serviceId"],
  },
};

export const traceTopicFlowTool = {
  name: "testseer_trace_topic_flow",
  description:
    "Trace an event through publishers, message schemas, DB touchpoints, gates, and validation hints (C-P2–P6). " +
    "Use crossRepo=true to trace across all indexed services in the org (join key: topic short_id + env). " +
    "Set liveVerify=true to verify indexed subscriptions against live GCP (MSG-10).",
  inputSchema: {
    type: "object" as const,
    properties: {
      serviceId: { type: "string", description: "Registered service ID (single-repo trace)" },
      orgId: { type: "string", description: "Org id for cross-repo trace (or TESTSEER_ORG_ID env)" },
      shortId: { type: "string", description: "Starting topic short id (or TESTSEER_TRACE_SHORT_ID env)" },
      env: { type: "string", description: "Env lane (default pdn or TESTSEER_TRACE_ENV)" },
      bundle: { type: "string", description: "Bundle name for missing-repo checks (workspace defaultBundle)" },
      crossRepo: { type: "boolean", description: "If true, trace across all services in orgId" },
      includeExternal: { type: "boolean", description: "If true, attach external/partner HTTP endpoint hops" },
      liveVerify: {
        type: "boolean",
        description: "When true, verify subscriptions in GCP and surface drift gaps (MSG-10)",
      },
      followMode: {
        type: "string",
        description: "Cross-repo BFS mode: runtime (default), inventory, or causal",
      },
      includeManifest: {
        type: "boolean",
        description: "When true with crossRepo, expand manifest/catalog subscribers (alias for inventory)",
      },
    },
    required: [],
  },
};

export const flowGatesTool = {
  name: "testseer_get_flow_gates",
  description:
    "Get config and business rule gates that must pass for event flow steps to run (C-P6). " +
    "Includes liveStatus/liveValue when LIVE_CONFIG_ENABLED is set on the backend.",
  inputSchema: {
    type: "object" as const,
    properties: {
      serviceId: { type: "string", description: "Registered service ID" },
      env: { type: "string", description: "Env lane" },
      flowStep: { type: "string", description: "Flow step label from rule pack (e.g. HYVEE_ADAPTER)" },
    },
    required: ["serviceId"],
  },
};

function appendLiveVerify(params: URLSearchParams, args: Record<string, string>) {
  if (args.liveVerify === "true") {
    params.set("liveVerify", "true");
  }
}

export async function handlePubSubInventory(args: Record<string, string>) {
  const params = new URLSearchParams({ serviceId: args.serviceId });
  if (args.env) params.set("env", args.env);
  if (args.shortId) params.set("shortId", args.shortId);
  if (args.role) params.set("role", args.role);
  appendLiveVerify(params, args);
  const { data: envelope } = await getPubSubInventory(params.toString());
  const summary = formatPubSubInventoryResponse(
    envelope as unknown as ResponseEnvelope<PubSubResourceRow[]>
  );
  return {
    content: [
      { type: "text" as const, text: summary },
      { type: "text" as const, text: formatMessagingFullJson(envelope) },
    ],
  };
}

export async function handleTraceTopicFlow(args: Record<string, string>) {
  const env = args.env ?? envTraceEnv();
  const crossRepo = args.crossRepo === "true";

  if (crossRepo) {
    const orgResult = requireOrgId(args.orgId);
    if (typeof orgResult !== "string") {
      return {
        content: [{ type: "text" as const, text: orgResult.error }],
        isError: true,
      };
    }
    const shortId = args.shortId ?? envTraceShortId();
    if (!shortId) {
      return {
        content: [
          {
            type: "text" as const,
            text: "shortId is required for cross-repo trace. Pass shortId or set TESTSEER_TRACE_SHORT_ID.",
          },
        ],
        isError: true,
      };
    }
    const params = new URLSearchParams({
      orgId: orgResult,
      shortId,
      env,
    });
    if (args.bundle) params.set("bundle", args.bundle);
    if (args.includeExternal === "true") params.set("includeExternal", "true");
    if (args.followMode) params.set("followMode", args.followMode);
    if (args.includeManifest === "true") params.set("includeManifest", "true");
    appendLiveVerify(params, args);
    const { data: envelope } = await getCrossRepoEventFlow(params.toString());
    const summary = formatTraceTopicFlowResponse(
      envelope as unknown as ResponseEnvelope<CrossRepoReport | SingleServiceReport>,
      true
    );
    return {
      content: [
        { type: "text" as const, text: summary },
        { type: "text" as const, text: formatMessagingFullJson(envelope) },
      ],
    };
  }

  if (!args.serviceId) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Provide serviceId for single-repo trace, or crossRepo=true with shortId.",
        },
      ],
      isError: true,
    };
  }
  const params = new URLSearchParams({ serviceId: args.serviceId, env });
  if (args.shortId) params.set("shortId", args.shortId);
  if (args.includeExternal === "true") params.set("includeExternal", "true");
  appendLiveVerify(params, args);
  const { data: envelope } = await getEventFlow(params.toString());
  const summary = formatTraceTopicFlowResponse(
    envelope as unknown as ResponseEnvelope<CrossRepoReport | SingleServiceReport>,
    false
  );
  return {
    content: [
      { type: "text" as const, text: summary },
      { type: "text" as const, text: formatMessagingFullJson(envelope) },
    ],
  };
}

export async function handleFlowGates(args: Record<string, string>) {
  const params = new URLSearchParams({ serviceId: args.serviceId });
  if (args.env) params.set("env", args.env);
  if (args.flowStep) params.set("flowStep", args.flowStep);
  const { data } = await getFlowGates(params.toString());
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
