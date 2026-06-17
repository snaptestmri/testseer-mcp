/**
 * Tests for pure rendering functions extracted from viz.html.
 *
 * Strategy: use node:vm to evaluate the actual <script> block from viz.html
 * inside a minimal browser-like sandbox.  This means tests always exercise
 * the real code — if someone edits viz.html the tests reflect the change.
 *
 * Functions under test:
 *   esc(s)                        — HTML-escape helper
 *   renderEntryFlow(report, svc)  — builds the entry-flow pipeline HTML
 *   renderEventFlow(report, viewMode) — pipeline (default) or matrix swimlane HTML
 *   renderEventFlowFactsExtra(schemas, gates, handlerFqn) — message schema + proto field table
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ── Load + evaluate viz.html script block ────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = resolve(
  __dirname,
  "../../testseer-backend/src/main/resources/static/viz.html"
);

/**
 * Creates a fresh vm sandbox with the viz.html script evaluated inside it.
 * Returns the sandbox so tests can call exported globals (esc, renderEntryFlow, …).
 */
function makeCtx() {
  const html = readFileSync(HTML_PATH, "utf8");

  // Inline app script only (skip <script src="…"> vendor tags such as d3).
  const match = html.match(/<script>\s*\n([\s\S]*?)<\/script>\s*<\/body>/);
  if (!match) throw new Error("No inline <script> block found in viz.html");
  // loadAll() runs at parse time in the browser; skip it in the test sandbox.
  const src = match[1].replace(/\nloadAll\(\);\s*$/, "");

  // Minimal DOM stub — enough for the script to initialise without throwing.
  // renderEntryFlow / renderEventFlow are pure string-builders so they never
  // call back into the DOM; stubs must satisfy loadStatus()/loadJourneyTopics().
  const makeEl = () => ({
    style: {},
    innerHTML: "",
    value: "",
    disabled: false,
    selectedOptions: [],
    options: [],
    classList: {
      contains: () => false,
      add: () => {},
      remove: () => {},
      toggle: () => {},
    },
    dataset: {},
  });

  async function stubFetch(url) {
    const path = String(url).split("?")[0];
    if (path.endsWith("/registry/services")) {
      return { ok: true, json: async () => [] };
    }
    if (path.endsWith("/v1/status")) {
      return { ok: true, json: async () => ({ services: [] }) };
    }
    if (path.includes("/v1/facts/entry-triggers")) {
      return { ok: true, json: async () => ({ data: [] }) };
    }
    if (path.includes("/v1/facts/pubsub/org")) {
      return { ok: true, json: async () => ({ data: [] }) };
    }
    return { ok: true, json: async () => ({ data: [] }) };
  }

  const sandbox = {
    // Browser globals
    document: {
      getElementById: () => makeEl(),
      querySelectorAll: () => Object.assign([], { forEach: () => {} }),
      addEventListener: () => {},
    },
    console,
    fetch: stubFetch,
    // d3 stub — only called from buildGraph() which we never invoke in these tests
    d3: new Proxy(
      {},
      {
        get: () =>
          new Proxy(() => {}, {
            get: (_t, _k) => new Proxy(() => {}, { get: (_t2, _k2) => () => ({}) }),
            apply: () => new Proxy(() => {}, { get: () => () => ({}) }),
          }),
      }
    ),
    // Promise / async support
    Promise,
    URLSearchParams,
  };
  // window === sandbox so that `window.runJourney = runJourney` assignments work
  sandbox.window = sandbox;

  vm.runInNewContext(src, sandbox);
  return sandbox;
}

// ── esc() ────────────────────────────────────────────────────────────────────

describe("esc()", () => {
  let esc;
  before(() => {
    esc = makeCtx().esc;
  });

  it("returns empty string for null", () => {
    assert.equal(esc(null), "");
  });

  it("returns empty string for undefined", () => {
    assert.equal(esc(undefined), "");
  });

  it("escapes ampersand", () => {
    assert.equal(esc("a&b"), "a&amp;b");
  });

  it("escapes less-than and greater-than", () => {
    assert.equal(esc("<script>"), "&lt;script&gt;");
  });

  it("escapes double quotes", () => {
    assert.equal(esc('"hello"'), "&quot;hello&quot;");
  });

  it("leaves plain strings untouched", () => {
    assert.equal(esc("hello world"), "hello world");
  });

  it("coerces numbers to string", () => {
    assert.equal(esc(42), "42");
  });

  it("escapes multiple special chars in one string", () => {
    assert.equal(esc('<a href="x&y">'), "&lt;a href=&quot;x&amp;y&quot;&gt;");
  });
});

// ── renderEntryFlow() ────────────────────────────────────────────────────────

describe("renderEntryFlow()", () => {
  let renderEntryFlow;
  before(() => {
    renderEntryFlow = makeCtx().renderEntryFlow;
  });

  const minimalSvc = { serviceName: "orders-svc" };

  it("uses serviceId as title when svc is null", () => {
    const report = { serviceId: "svc-orders", steps: [] };
    const html = renderEntryFlow(report, null);
    assert.match(html, /svc-orders/);
  });

  it("uses svc.serviceName as title when provided", () => {
    const report = { serviceId: "svc-orders", steps: [] };
    const html = renderEntryFlow(report, minimalSvc);
    assert.match(html, /orders-svc/);
  });

  it("shows trigger count in subtitle", () => {
    const report = {
      serviceId: "svc-orders",
      envLane: "pdn",
      steps: [
        { order: 1, trigger: { triggerKind: "REST_INBOUND", httpMethod: "POST", pathPattern: "/orders" }, reads: [], writes: [], gates: [] },
        { order: 2, trigger: { triggerKind: "WEBHOOK_INBOUND", pathPattern: "/webhook" }, reads: [], writes: [], gates: [] },
      ],
    };
    const html = renderEntryFlow(report, minimalSvc);
    assert.match(html, /2 independent entry triggers/);
  });

  it("renders step number and trigger kind badge", () => {
    const report = {
      serviceId: "svc-1",
      steps: [
        {
          order: 1,
          trigger: { triggerKind: "REST_INBOUND", httpMethod: "GET", pathPattern: "/health" },
          reads: [],
          writes: [],
          gates: [],
        },
      ],
    };
    const html = renderEntryFlow(report, minimalSvc);
    assert.match(html, /Step 1/);
    assert.match(html, /REST_INBOUND/);
    assert.match(html, /GET \/health/);
  });

  it("renders DB reads with ▶ prefix", () => {
    const report = {
      serviceId: "svc-1",
      steps: [
        {
          order: 1,
          trigger: { triggerKind: "REST_INBOUND" },
          reads: [{ tableOrEntity: "orders_table", storeType: "POSTGRES" }],
          writes: [],
          gates: [],
        },
      ],
    };
    const html = renderEntryFlow(report, minimalSvc);
    assert.match(html, /▶/);
    assert.match(html, /orders_table/);
    assert.match(html, /db-read/);
  });

  it("renders DB writes with ✎ prefix", () => {
    const report = {
      serviceId: "svc-1",
      steps: [
        {
          order: 1,
          trigger: { triggerKind: "REST_INBOUND" },
          reads: [],
          writes: [{ tableOrEntity: "payments_table" }],
          gates: [],
        },
      ],
    };
    const html = renderEntryFlow(report, minimalSvc);
    assert.match(html, /✎/);
    assert.match(html, /payments_table/);
    assert.match(html, /db-write/);
  });

  it("renders gates with ⚑ prefix", () => {
    const report = {
      serviceId: "svc-1",
      steps: [
        {
          order: 1,
          trigger: { triggerKind: "REST_INBOUND" },
          reads: [],
          writes: [],
          gates: [{ gateKey: "FEATURE_FLAG_X", requiredValue: "true" }],
        },
      ],
    };
    const html = renderEntryFlow(report, minimalSvc);
    assert.match(html, /⚑/);
    assert.match(html, /FEATURE_FLAG_X/);
  });

  it("renders short handler name from FQN", () => {
    const report = {
      serviceId: "svc-1",
      steps: [
        {
          order: 1,
          trigger: {
            triggerKind: "REST_INBOUND",
            linkedHandlerFqn: "com.example.orders.OrderController",
            linkedMethod: "createOrder",
          },
          reads: [],
          writes: [],
          gates: [],
        },
      ],
    };
    const html = renderEntryFlow(report, minimalSvc);
    // Should show last-two-segments of FQN + method
    assert.match(html, /orders\.OrderController\.createOrder\(\)/);
  });

  it("does not render arrows for independent trigger catalog", () => {
    const step = (n) => ({
      order: n,
      trigger: { triggerKind: "REST_INBOUND", httpMethod: "GET", pathPattern: `/path-${n}` },
      reads: [],
      writes: [],
      gates: [],
    });
    const report = { serviceId: "svc-1", steps: [step(1), step(2), step(3)] };
    const html = renderEntryFlow(report, minimalSvc);
    assert.match(html, /entry-catalog/);
    assert.equal((html.match(/step-arrow/g) || []).length, 0);
    assert.doesNotMatch(html, /Step 1/);
  });

  it("renders arrows only when entry flow chains to messaging hops", () => {
    const report = {
      serviceId: "svc-1",
      steps: [
        {
          order: 1,
          trigger: { triggerKind: "PUBSUB_SUBSCRIBE", pathPattern: "PDN_S.ORDER_CREATED" },
          reads: [],
          writes: [],
          gates: [],
        },
      ],
      messagingFlow: {
        steps: [
          { order: 1, workload: "orders-consumer", handler: "com.example.OrderHandler" },
          { order: 2, workload: "fulfillment-consumer", handler: "com.example.FulfillHandler" },
        ],
      },
    };
    const html = renderEntryFlow(report, minimalSvc);
    assert.match(html, /entry-pipeline/);
    assert.match(html, /linked chain/);
    // One arrow from entry to first hop, one between hops
    assert.equal((html.match(/step-arrow/g) || []).length, 2);
    assert.match(html, /Hop 1/);
    assert.match(html, /Hop 2/);
  });

  it("escapes HTML in trigger path", () => {
    const report = {
      serviceId: "svc-1",
      steps: [
        {
          order: 1,
          trigger: { triggerKind: "REST_INBOUND", pathPattern: "/path?a=1&b=<evil>" },
          reads: [],
          writes: [],
          gates: [],
        },
      ],
    };
    const html = renderEntryFlow(report, minimalSvc);
    assert.match(html, /&amp;/);
    assert.match(html, /&lt;evil&gt;/);
    // Raw < must never appear inside the generated HTML
    assert.doesNotMatch(html, /<evil>/);
  });
});

// ── renderEventFlow() ────────────────────────────────────────────────────────

describe("renderEventFlow() — pipeline (default)", () => {
  let renderEventFlow;
  before(() => {
    renderEventFlow = makeCtx().renderEventFlow;
  });

  it("returns no-services message when hops have no participants", () => {
    const report = { hops: [{ order: 1, topicShortId: "PDN_T.FOO", publishers: [], subscribers: [] }] };
    const html = renderEventFlow(report);
    assert.match(html, /No services/);
  });

  it("returns no-services message for empty hops array", () => {
    const html = renderEventFlow({ hops: [] });
    assert.match(html, /No services/);
  });

  it("renders hop pipeline with topic cards", () => {
    const report = makeTwoHopReport();
    const html = renderEventFlow(report);
    assert.match(html, /entry-pipeline/);
    assert.match(html, /event-hop-card/);
    assert.match(html, /PDN_T\.ORDER_CREATED/);
    assert.match(html, /PDN_T\.ORDER_FULFILLED/);
    assert.doesNotMatch(html, /swimlane-table/);
  });

  it("renders separate pub and sub chips (not merged pub+sub)", () => {
    const report = {
      startTopic: "PDN_T.LOOP",
      orgId: "acme",
      hops: [{
        order: 1,
        topicShortId: "PDN_T.LOOP",
        publishers:  [{ serviceId: "svc-a", serviceName: "svc-a", role: "PUBLISH", shortId: "PDN_T.LOOP" }],
        subscribers: [{ serviceId: "svc-a", serviceName: "svc-a", role: "SUBSCRIBE", shortId: "PDN_S.LOOP.HANDLER" }],
      }],
    };
    const html = renderEventFlow(report);
    assert.match(html, /event-participant pub/);
    assert.match(html, /event-participant sub/);
    assert.doesNotMatch(html, /pub\+sub/);
    assert.match(html, /PDN_S\.LOOP\.HANDLER/);
  });

  it("shows per-subscriber consistency hints on chips", () => {
    const report = {
      startTopic: "PDN_T.FOO",
      orgId: "acme",
      hops: [{
        order: 1,
        topicShortId: "PDN_T.FOO",
        publishers: [],
        subscribers: [{
          serviceId: "svc-a",
          serviceName: "svc-a",
          shortId: "PDN_S.FOO.HANDLER",
          consistencyHints: [{ pattern: "DUAL_WRITE_SAME_HANDLER" }],
        }],
      }],
    };
    const html = renderEventFlow(report);
    assert.match(html, /DUAL_WRITE_SAME_HANDLER/);
    assert.match(html, /event-participant-badges/);
  });

  it("renders first-hop inbound triggers as entry anchor", () => {
    const report = {
      startTopic: "PDN_T.FOO",
      orgId: "acme",
      hops: [{
        order: 1,
        topicShortId: "PDN_T.FOO",
        publishers: [{ serviceId: "svc-a", serviceName: "svc-a" }],
        subscribers: [{
          serviceId: "svc-a",
          serviceName: "svc-a",
          inboundTriggers: [{
            triggerKind: "PUBSUB_SUBSCRIBE",
            pathPattern: "PDN_S.FOO.ENTRY",
            linkedHandlerFqn: "com.example.FooHandler",
            linkedMethod: "onMessage",
          }],
        }],
      }],
    };
    const html = renderEventFlow(report);
    assert.match(html, /event-entry-anchor/);
    assert.match(html, /PUBSUB_SUBSCRIBE/);
    assert.match(html, /FooHandler\.onMessage\(\)/);
  });

  it("renders terminal continuation cards", () => {
    const report = {
      startTopic: "PDN_T.FOO",
      orgId: "acme",
      hops: [{
        order: 1,
        topicShortId: "PDN_T.FOO",
        publishers: [{ serviceId: "svc-a", serviceName: "svc-a" }],
        subscribers: [],
        terminalContinuations: [{
          triggerKind: "CRON_K8S",
          cronJobName: "batch-retry-job",
          serviceId: "svc-a",
        }],
      }],
    };
    const html = renderEventFlow(report);
    assert.match(html, /continuation-card/);
    assert.match(html, /batch-retry-job/);
  });

  it("renders hop-scoped gaps on the hop card", () => {
    const report = {
      ...makeTwoHopReport(),
      gaps: [{ gapType: "TERMINAL_BATCH_RETRY", description: "PDN_T.ORDER_CREATED terminal" }],
    };
    const html = renderEventFlow(report);
    assert.match(html, /event-hop-gaps/);
    assert.match(html, /TERMINAL_BATCH_RETRY/);
  });

  it("renders missing bundle repos in meta", () => {
    const report = { ...makeTwoHopReport(), missingBundleRepos: ["partner-repo"] };
    const html = renderEventFlow(report);
    assert.match(html, /Not indexed/);
    assert.match(html, /partner-repo/);
  });

  it("escapes HTML in topic short IDs", () => {
    const report = {
      startTopic: "PDN_T.<XSS>",
      orgId: "acme",
      hops: [{
        order: 1,
        topicShortId: "PDN_T.<XSS>",
        publishers: [{ serviceId: "svc-a", serviceName: "svc-a" }],
        subscribers: [],
      }],
    };
    const html = renderEventFlow(report);
    assert.doesNotMatch(html, /<XSS>/);
    assert.match(html, /&lt;XSS&gt;/);
  });

  it("renders graph shell when viewMode is graph", () => {
    const html = renderEventFlow(makeTwoHopReport(), "graph");
    assert.match(html, /event-flow-graph-svg/);
    assert.match(html, /event-flow-graph-wrap/);
  });
});

describe("renderEventFlow() — matrix view", () => {
  let renderEventFlow;
  before(() => {
    renderEventFlow = makeCtx().renderEventFlow;
  });

  it("renders swimlane table when viewMode is matrix", () => {
    const report = makeTwoHopReport();
    const html = renderEventFlow(report, "matrix");
    assert.match(html, /swimlane-table/);
    assert.match(html, /PDN_T\.ORDER_CREATED/);
    assert.match(html, /PDN_T\.ORDER_FULFILLED/);
  });

  it("renders a row per unique service in matrix mode", () => {
    const report = makeTwoHopReport();
    const html = renderEventFlow(report, "matrix");
    assert.match(html, /orders-svc/);
    assert.match(html, /fulfillment-svc/);
    assert.match(html, /notify-svc/);
  });

  it("marks publisher cells with matrix-chip pub in matrix mode", () => {
    const report = makeTwoHopReport();
    const html = renderEventFlow(report, "matrix");
    assert.match(html, /matrix-chip pub/);
    assert.match(html, /↑/);
  });

  it("marks subscriber cells with matrix-chip sub in matrix mode", () => {
    const report = makeTwoHopReport();
    const html = renderEventFlow(report, "matrix");
    assert.match(html, /matrix-chip sub/);
    assert.match(html, /↓/);
  });

  it("marks pub+sub as separate matrix chips in matrix mode", () => {
    const report = {
      startTopic: "PDN_T.LOOP",
      orgId: "acme",
      hops: [{
        order: 1,
        topicShortId: "PDN_T.LOOP",
        publishers:  [{ serviceId: "svc-a", serviceName: "svc-a", role: "PUBLISH", shortId: "PDN_T.LOOP" }],
        subscribers: [{ serviceId: "svc-a", serviceName: "svc-a", role: "SUBSCRIBE", shortId: "PDN_S.LOOP.HANDLER" }],
      }],
    };
    const html = renderEventFlow(report, "matrix");
    assert.match(html, /matrix-chip pub/);
    assert.match(html, /matrix-chip sub/);
    assert.doesNotMatch(html, /pub\+sub/);
  });

  it("renders empty cells for services not participating in a hop", () => {
    const report = makeTwoHopReport();
    const html = renderEventFlow(report, "matrix");
    assert.match(html, /lane-cell empty/);
  });

  it("renders gaps section when report includes gaps", () => {
    const report = {
      ...makeTwoHopReport(),
      gaps: [{ gapType: "MISSING_SUBSCRIBER", description: "No subscriber found" }],
    };
    const html = renderEventFlow(report, "matrix");
    assert.match(html, /gap-badge/);
    assert.match(html, /MISSING_SUBSCRIBER/);
  });

  it("renders report-level consistency hints in matrix mode", () => {
    const report = {
      ...makeTwoHopReport(),
      consistencyHints: [{ pattern: "DUAL_WRITE", scopeKind: "SERVICE" }],
    };
    const html = renderEventFlow(report, "matrix");
    assert.match(html, /hint-badge/);
    assert.match(html, /DUAL_WRITE/);
  });
});

describe("buildEventFlowGraphModel()", () => {
  let buildEventFlowGraphModel;
  let computePrimaryTracePath;
  before(() => {
    const ctx = makeCtx();
    buildEventFlowGraphModel = ctx.buildEventFlowGraphModel;
    computePrimaryTracePath = ctx.computePrimaryTracePath;
  });

  it("creates topic and participant nodes per hop", () => {
    const model = buildEventFlowGraphModel(makeTwoHopReport());
    assert.ok(model.nodes.some(n => n.type === "topic" && n.label === "PDN_T.ORDER_CREATED"));
    assert.ok(model.nodes.filter(n => n.type === "publisher").length >= 2);
    assert.ok(model.nodes.filter(n => n.type === "subscriber").length >= 2);
  });

  it("creates handoff edges for same service across adjacent hops", () => {
    const model = buildEventFlowGraphModel(makeTwoHopReport());
    const handoffs = model.edges.filter(e => e.kind === "handoff");
    assert.ok(handoffs.length >= 1);
    assert.match(handoffs[0].source, /^sub:/);
    assert.match(handoffs[0].target, /^pub:/);
  });

  it("creates publish and subscribe edges within hops", () => {
    const model = buildEventFlowGraphModel(makeTwoHopReport());
    assert.ok(model.edges.some(e => e.kind === "publish"));
    assert.ok(model.edges.some(e => e.kind === "subscribe"));
  });

  it("collapses entry triggers into one anchor node", () => {
    const report = {
      startTopic: "PDN_T.FOO",
      orgId: "acme",
      hops: [{
        order: 1,
        topicShortId: "PDN_T.FOO",
        publishers: [{ serviceId: "svc-a", serviceName: "svc-a" }],
        subscribers: [{
          serviceId: "svc-a",
          serviceName: "svc-a",
          inboundTriggers: [
            { triggerId: "t1", triggerKind: "PUBSUB_SUBSCRIBE", pathPattern: "PDN_S.A" },
            { triggerId: "t2", triggerKind: "PUBSUB_SUBSCRIBE", pathPattern: "PDN_S.B" },
          ],
        }],
      }],
    };
    const model = buildEventFlowGraphModel(report);
    assert.equal(model.nodes.filter(n => n.type === "entry").length, 1);
    assert.ok(model.nodes.some(n => n.id === "entry:anchor"));
    assert.ok(model.edges.filter(e => e.kind === "entry").length <= 1);
  });

  it("computePrimaryTracePath follows one chain across hops", () => {
    const report = makeTwoHopReport();
    const model = buildEventFlowGraphModel(report);
    const path = computePrimaryTracePath(report.hops, model.edges);
    assert.ok(path.length >= 4);
    assert.ok(path.some(id => id.startsWith("topic:")));
    assert.ok(path.some(id => id.startsWith("sub:")));
  });
});

describe("renderMatrixCell()", () => {
  let renderMatrixCell;
  before(() => {
    renderMatrixCell = makeCtx().renderMatrixCell;
  });

  it("renders stacked pub and sub chips", () => {
    const html = renderMatrixCell(
      [{ serviceId: "a", serviceName: "svc-a", shortId: "PDN_T.FOO" }],
      [{ serviceId: "a", serviceName: "svc-a", shortId: "PDN_S.FOO.HANDLER" }],
      "PDN_T.FOO",
      null
    );
    assert.match(html, /matrix-chip pub/);
    assert.match(html, /matrix-chip sub/);
    assert.match(html, /PDN_S\.FOO\.HANDLER/);
  });

  it("dims chips when focus service does not match", () => {
    const html = renderMatrixCell(
      [{ serviceId: "other", serviceName: "other" }],
      [],
      "PDN_T.FOO",
      "svc-focus"
    );
    assert.match(html, /event-dimmed/);
  });
});

describe("renderEventFlowFactsExtra()", () => {
  let renderEventFlowFactsExtra;
  before(() => {
    renderEventFlowFactsExtra = makeCtx().renderEventFlowFactsExtra;
  });

  it("renders proto field table from payloadFields JSON", () => {
    const html = renderEventFlowFactsExtra([{
      direction: "INBOUND",
      payloadProto: "RIQOfferEvent",
      payloadFields: JSON.stringify([
        { name: "offerId", type: "string", number: "1", repeated: "false" },
        { name: "partnerId", type: "int32", number: "2", repeated: "false" },
      ]),
      linkedClassFqn: "com.example.Handler",
    }], [], "com.example.Handler");
    assert.match(html, /Message schema/);
    assert.match(html, /RIQOfferEvent/);
    assert.match(html, /proto-fields/);
    assert.match(html, /offerId/);
    assert.match(html, /partnerId/);
    assert.match(html, />string</);
  });

  it("marks repeated fields in the type column", () => {
    const html = renderEventFlowFactsExtra([{
      direction: "OUTBOUND",
      payloadProto: "BatchEvent",
      payloadFields: JSON.stringify([
        { name: "items", type: "Item", number: "3", repeated: "true" },
      ]),
    }], [], null);
    assert.match(html, /repeated Item/);
  });

  it("truncates large field lists with a more indicator", () => {
    const fields = Array.from({ length: 30 }, (_, i) => ({
      name: `field${i}`, type: "string", number: String(i + 1), repeated: "false",
    }));
    const html = renderEventFlowFactsExtra([{
      direction: "INBOUND",
      payloadProto: "BigMessage",
      payloadFields: JSON.stringify(fields),
    }], [], null);
    assert.match(html, /\+ 6 more fields/);
    assert.doesNotMatch(html, /field29/);
  });

  it("omits field table when payloadFields is empty", () => {
    const html = renderEventFlowFactsExtra([{
      direction: "INBOUND",
      payloadProto: "UnknownEvent",
      payloadFields: "[]",
    }], [], null);
    assert.match(html, /UnknownEvent/);
    assert.doesNotMatch(html, /proto-fields/);
  });
});

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeTwoHopReport() {
  return {
    startTopic: "PDN_T.ORDER_CREATED",
    orgId: "acme",
    envLane: "pdn",
    hops: [
      {
        order: 1,
        topicShortId: "PDN_T.ORDER_CREATED",
        publishers: [
          { serviceId: "svc-orders", serviceName: "orders-svc", role: "PUBLISH", shortId: "PDN_T.ORDER_CREATED" },
        ],
        subscribers: [
          { serviceId: "svc-fulfillment", serviceName: "fulfillment-svc", role: "SUBSCRIBE", shortId: "PDN_S.ORDER_CREATED.FULFILL" },
        ],
      },
      {
        order: 2,
        topicShortId: "PDN_T.ORDER_FULFILLED",
        publishers: [
          { serviceId: "svc-fulfillment", serviceName: "fulfillment-svc", role: "PUBLISH", shortId: "PDN_T.ORDER_FULFILLED" },
        ],
        subscribers: [
          { serviceId: "svc-notify", serviceName: "notify-svc", role: "SUBSCRIBE", shortId: "PDN_S.ORDER_FULFILLED.NOTIFY" },
        ],
      },
    ],
  };
}
