import { getEntryTriggerImpact, getEntryTriggers, traceEntryFlow } from "../client.js";

export const entryTriggersTool = {
  name: "testseer_get_entry_triggers",
  description:
    "Query inbound entry triggers for a service — REST/webhook ingress points that can start processing " +
    "(OIS create, External payout webhook, partner adapter ingress, etc.). " +
    "Pass handlerFqn (+ orgId) for reverse impact: which triggers fan into a changed handler (TRG-13). " +
    "Distinct from outbound external endpoints.",
  inputSchema: {
    type: "object" as const,
    properties: {
      orgId: {
        type: "string",
        description: "Org id (e.g. acme). Required with handlerFqn for reverse impact.",
      },
      handlerFqn: {
        type: "string",
        description: "Handler class FQN or Class#method — reverse TRIGGERED_BY lookup (TRG-13).",
      },
      serviceId: {
        type: "string",
        description: "Registered service ID — required for inventory; optional narrow filter for impact.",
      },
      env: { type: "string", description: "Env lane: pdn, qa, prod" },
      triggerKind: { type: "string", description: "REST_INBOUND, WEBHOOK_INBOUND, SPRING_BOOT_MAIN, etc." },
      actor: { type: "string", description: "Actor slug e.g. external, cpa, partner" },
      boundary: { type: "string", description: "EXTERNAL or INTERNAL" },
      includeWiring: {
        type: "string",
        description: "true to include SPRING_BOOT_MAIN deploy/wiring triggers (default false)",
      },
    },
    required: [],
  },
};

export const traceEntryFlowTool = {
  name: "testseer_trace_entry_flow",
  description:
    "Forward trace from an inbound entry trigger (by triggerId or HTTP path) through handler data access, " +
    "flow gates, optional Option C messaging hops (includeMessaging), cross-repo trace (crossRepo), " +
    "and outbound partner HTTP (includeExternal). TRG-12.",
  inputSchema: {
    type: "object" as const,
    properties: {
      serviceId: { type: "string", description: "Registered service ID" },
      triggerId: { type: "string", description: "Entry trigger ID from testseer_get_entry_triggers" },
      path: { type: "string", description: "HTTP path pattern e.g. /ois/offer" },
      env: { type: "string", description: "Env lane (default unknown)" },
      includeMessaging: {
        type: "string",
        description: "true to attach Option C event-flow from handler publish/subscribe topic",
      },
      includeExternal: {
        type: "string",
        description: "true to attach outbound external endpoints on messaging steps and handler",
      },
      crossRepo: {
        type: "string",
        description: "true with includeMessaging to attach cross-repo BFS trace (requires orgId or service org)",
      },
      orgId: { type: "string", description: "Org id for crossRepo trace (e.g. acme)" },
      maxHops: { type: "string", description: "Max cross-repo hops (default 12)" },
      includeWiring: {
        type: "string",
        description: "true to attach @ComponentScan wiring targets for SPRING_BOOT_MAIN traces",
      },
    },
    required: ["serviceId"],
  },
};

export async function handleEntryTriggers(args: Record<string, string>) {
  if (args.handlerFqn) {
    if (!args.orgId) {
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: "orgId is required when handlerFqn is set (reverse impact lookup).",
        }],
      };
    }
    const params = new URLSearchParams({
      orgId: args.orgId,
      handlerFqn: args.handlerFqn,
    });
    if (args.serviceId) params.set("serviceId", args.serviceId);
    if (args.env) params.set("env", args.env);
    const { data } = await getEntryTriggerImpact(params.toString());
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }

  if (!args.serviceId) {
    return {
      isError: true,
      content: [{
        type: "text" as const,
        text: "serviceId is required for entry trigger inventory (or pass orgId + handlerFqn for reverse impact).",
      }],
    };
  }

  const params = new URLSearchParams({ serviceId: args.serviceId });
  if (args.env) params.set("env", args.env);
  if (args.triggerKind) params.set("triggerKind", args.triggerKind);
  if (args.actor) params.set("actor", args.actor);
  if (args.boundary) params.set("boundary", args.boundary);
  if (args.includeWiring === "true") params.set("includeWiring", "true");
  const { data } = await getEntryTriggers(params.toString());
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export async function handleTraceEntryFlow(args: Record<string, string>) {
  const params = new URLSearchParams({ serviceId: args.serviceId });
  if (args.triggerId) params.set("triggerId", args.triggerId);
  if (args.path) params.set("path", args.path);
  if (args.env) params.set("env", args.env);
  if (args.includeMessaging === "true") params.set("includeMessaging", "true");
  if (args.includeExternal === "true") params.set("includeExternal", "true");
  if (args.crossRepo === "true") params.set("crossRepo", "true");
  if (args.orgId) params.set("orgId", args.orgId);
  if (args.maxHops) params.set("maxHops", args.maxHops);
  if (args.includeWiring === "true") params.set("includeWiring", "true");
  const { data } = await traceEntryFlow(params.toString());
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
