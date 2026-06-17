import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { mockFetch, mockJson, resetMocks } from "./helpers/mock-fetch.mjs";

const BASE = "http://localhost:8080";

describe("MCP tool handlers", () => {
  before(async () => {
    globalThis.fetch = mockFetch;
  });

  beforeEach(() => {
    resetMocks();
  });

  after(() => {
    delete globalThis.fetch;
    resetMocks();
  });

  // ── Clear index ─────────────────────────────────────────────────────────────

  it("testseer_clear_index requires serviceId for SERVICE scope", async () => {
    const { handleClearIndex } = await import("../dist/tools/clear-index.js");
    const result = await handleClearIndex({ scope: "SERVICE" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /serviceId is required/);
  });

  it("testseer_clear_index calls backend clear API", async () => {
    mockJson("POST", `${BASE}/admin/index/clear`, {
      scope: "SERVICE",
      serviceId: "svc-1",
      deletedCounts: { symbolFacts: 5 },
    });

    const { handleClearIndex } = await import("../dist/tools/clear-index.js");
    const result = await handleClearIndex({ scope: "SERVICE", serviceId: "svc-1" });
    assert.equal(result.isError, undefined);
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.deletedCounts.symbolFacts, 5);
  });

  // ── Gaps ────────────────────────────────────────────────────────────────────

  it("testseer_get_gaps requires serviceId", async () => {
    const { handleGaps } = await import("../dist/tools/gaps.js");
    const result = await handleGaps({});
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /serviceId is required/);
  });

  it("testseer_get_gaps surfaces backend error when /v1/gaps missing", async () => {
    mockJson("GET", `${BASE}/v1/gaps?serviceId=svc-1`, {}, { ok: false, status: 404 });

    const { handleGaps } = await import("../dist/tools/gaps.js");
    const result = await handleGaps({ serviceId: "svc-1" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /404/);
  });

  it("testseer_get_gaps returns coverage summary and prioritised gaps", async () => {
    mockJson("GET", `${BASE}/v1/gaps?serviceId=svc-1`, {
      schemaVersion: "1.0",
      freshnessStatus: "CURRENT",
      data: {
        serviceId: "svc-1",
        commitSha: "abc123",
        productionClassCount: 10,
        testedClassCount: 7,
        untestedClassCount: 3,
        gaps: [
          {
            classFqn: "com.example.UntestedController",
            filePath: "UntestedController.java",
            kind: "ENDPOINT_CONTROLLER",
          },
          { classFqn: "com.example.Helper", filePath: "Helper.java", kind: "CLASS" },
        ],
      },
    });

    const { handleGaps } = await import("../dist/tools/gaps.js");
    const result = await handleGaps({ serviceId: "svc-1" });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /Coverage: \*\*70%\*\*/);
    assert.match(result.content[0].text, /UntestedController/);
    const body = JSON.parse(result.content[1].text.split("Full JSON:\n")[1]);
    assert.equal(body.gaps[0].kind, "ENDPOINT_CONTROLLER");
  });

  // ── Impact ──────────────────────────────────────────────────────────────────

  it("testseer_get_impact requires serviceId and commitSha", async () => {
    const { handleImpact } = await import("../dist/tools/impact.js");
    const result = await handleImpact({ serviceId: "svc-1" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /serviceId and commitSha are required/);
  });

  it("testseer_get_impact returns formatted summary and JSON", async () => {
    mockJson(
      "GET",
      `${BASE}/v1/impact/pr?serviceId=svc-orders&commitSha=abc123def4567890`,
      {
        schemaVersion: "1.0",
        freshnessStatus: "CURRENT",
        data: {
          serviceId: "svc-orders",
          commitSha: "abc123def4567890",
          changedSymbols: [
            {
              symbolFqn: "com.example.orders.OrderController",
              symbolKind: "ENDPOINT",
              filePath: "OrderController.java",
              httpMethod: "POST",
              path: "/orders",
            },
          ],
          affectedConsumers: [
            {
              source: "GRAPH",
              consumerServiceId: "svc-gateway",
              consumerServiceName: "gateway-svc",
              consumerClass: "com.example.GatewayClient",
              nodeType: "SERVICE",
              httpMethod: "POST",
              path: "/orders",
            },
          ],
          downstreamDependencies: [],
          suggestedTestScope: [
            {
              type: "UNIT",
              className: "OrderControllerTest",
              targetService: null,
              exists: false,
              reason: "covers changed endpoint",
            },
          ],
          missingTestClasses: ["com.example.orders.OrderController"],
        },
      }
    );

    const { handleImpact } = await import("../dist/tools/impact.js");
    const result = await handleImpact({ serviceId: "svc-orders", commitSha: "abc123def4567890" });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /Impact Analysis/);
    assert.match(result.content[0].text, /OrderController/);
    const body = JSON.parse(result.content[1].text.split("Full JSON:\n")[1]);
    assert.equal(body.changedSymbols[0].path, "/orders");
  });

  it("testseer_get_impact surfaces NOT_INDEXED freshness", async () => {
    mockJson("GET", `${BASE}/v1/impact/pr?serviceId=svc-missing&commitSha=deadbeef`, {
      schemaVersion: "1.0",
      freshnessStatus: "NOT_INDEXED",
      data: null,
    });

    const { handleImpact } = await import("../dist/tools/impact.js");
    const result = await handleImpact({ serviceId: "svc-missing", commitSha: "deadbeef" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /not been indexed/i);
  });

  // ── Services ────────────────────────────────────────────────────────────────

  it("testseer_list_services returns formatted service list", async () => {
    mockJson("GET", `${BASE}/registry/services`, [
      {
        serviceId: "svc-orders",
        orgId: "quotient",
        repo: "platform-orders",
        serviceName: "orders-svc",
        moduleType: "SERVICE",
        buildTool: "MAVEN",
        enabled: true,
      },
    ]);

    const { handleServiceTool } = await import("../dist/tools/services.js");
    const result = await handleServiceTool("testseer_list_services", {});
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /Registered services \(1\)/);
    assert.match(result.content[0].text, /orders-svc/);
    const services = JSON.parse(result.content[1].text.split("Full JSON:\n")[1]);
    assert.equal(services[0].serviceId, "svc-orders");
  });

  it("testseer_get_service_status requires serviceId", async () => {
    const { handleServiceTool } = await import("../dist/tools/services.js");
    const result = await handleServiceTool("testseer_get_service_status", {});
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /serviceId required/);
  });

  it("testseer_get_service_status returns freshness details", async () => {
    mockJson("GET", `${BASE}/v1/status/svc-orders`, {
      schemaVersion: "1.0",
      freshnessStatus: "CURRENT",
      indexedAt: "2026-06-01T12:00:00Z",
      commitSha: "abc123",
      data: { serviceId: "svc-orders", indexedAt: "2026-06-01T12:00:00Z", commitSha: "abc123" },
    });

    const { handleServiceTool } = await import("../dist/tools/services.js");
    const result = await handleServiceTool("testseer_get_service_status", { serviceId: "svc-orders" });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /Status: \*\*CURRENT\*\*/);
    assert.match(result.content[0].text, /abc123/);
  });

  it("testseer_get_service_description requires serviceId", async () => {
    const { handleServiceTool } = await import("../dist/tools/services.js");
    const result = await handleServiceTool("testseer_get_service_description", {});
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /serviceId required/);
  });

  it("testseer_get_service_description returns cached description", async () => {
    mockJson("GET", `${BASE}/v1/services/svc-orders/description`, {
      serviceId: "svc-orders",
      description: "Handles order lifecycle and redemption.",
      generatedAt: "2026-06-01T12:00:00Z",
      model: "gpt-4",
    });

    const { handleServiceTool } = await import("../dist/tools/services.js");
    const result = await handleServiceTool("testseer_get_service_description", { serviceId: "svc-orders" });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /Handles order lifecycle/);
  });

  it("testseer_get_service_description falls back when description missing", async () => {
    mockJson(
      "GET",
      `${BASE}/v1/services/svc-new/description`,
      { error: "not found", message: "missing", requestId: "r-1" },
      { ok: false, status: 404 }
    );

    const { handleServiceTool } = await import("../dist/tools/services.js");
    const result = await handleServiceTool("testseer_get_service_description", { serviceId: "svc-new" });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /No description generated yet/);
  });

  // ── Detect service ──────────────────────────────────────────────────────────

  it("testseer_detect_service reads serviceId from .testseer/config.yml", async () => {
    const project = mkdtempSync(join(tmpdir(), "testseer-detect-config-"));
    mkdirSync(join(project, ".testseer"), { recursive: true });
    writeFileSync(
      join(project, ".testseer", "config.yml"),
      'serviceId: svc-from-config\norgId: quotient\nrepo: my-repo\n'
    );

    try {
      const { handleDetect } = await import("../dist/tools/detect.js");
      const result = await handleDetect({ projectPath: project });
      assert.equal(result.isError, undefined);
      const body = JSON.parse(result.content[0].text);
      assert.equal(body.serviceId, "svc-from-config");
      assert.equal(body.source, "config_file");
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it("testseer_detect_service resolves service from registry via git remote", async () => {
    const project = mkdtempSync(join(tmpdir(), "testseer-detect-git-"));
    execSync("git init", { cwd: project, stdio: "pipe" });
    execSync("git remote add origin git@github.com:quotient/my-service.git", {
      cwd: project,
      stdio: "pipe",
    });

    mockJson("GET", `${BASE}/registry/services`, [
      {
        serviceId: "svc-registry",
        orgId: "quotient",
        repo: "my-service",
        serviceName: "my-service",
        moduleType: "SERVICE",
        buildTool: "MAVEN",
        enabled: true,
      },
    ]);

    try {
      const { handleDetect } = await import("../dist/tools/detect.js");
      const result = await handleDetect({ projectPath: project });
      assert.equal(result.isError, undefined);
      const body = JSON.parse(result.content[0].text);
      assert.equal(body.serviceId, "svc-registry");
      assert.equal(body.source, "registry_lookup");
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it("testseer_detect_service returns error when service cannot be resolved", async () => {
    const project = mkdtempSync(join(tmpdir(), "testseer-detect-fail-"));
    mkdirSync(project, { recursive: true });

    try {
      const { handleDetect } = await import("../dist/tools/detect.js");
      const result = await handleDetect({ projectPath: project });
      assert.equal(result.isError, true);
      const body = JSON.parse(result.content[0].text);
      assert.match(body.error, /Could not detect service/);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  // ── Trigger index ───────────────────────────────────────────────────────────

  it("testseer_trigger_index requires serviceId", async () => {
    const { handleIndex } = await import("../dist/tools/index.js");
    const result = await handleIndex({});
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /serviceId required/);
  });

  it("testseer_trigger_index queues index job", async () => {
    mockJson("POST", `${BASE}/admin/index/svc-orders`, {
      serviceId: "svc-orders",
      status: "QUEUED",
      commitSha: "abc123",
    });

    const { handleIndex } = await import("../dist/tools/index.js");
    const result = await handleIndex({ serviceId: "svc-orders", commitSha: "abc123" });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /Index job queued/);
    assert.match(result.content[0].text, /QUEUED/);
  });

  // ── Changed endpoints ─────────────────────────────────────────────────────────

  it("testseer_get_changed_endpoints requires all arguments", async () => {
    const { handleChangedEndpoints } = await import("../dist/tools/changed-endpoints.js");
    const result = await handleChangedEndpoints({ orgId: "acme", repo: "orders" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /orgId, repo, prNumber, and serviceId are all required/);
  });

  it("testseer_get_changed_endpoints reports when PR has no Java files", async () => {
    mockJson("GET", "https://api.github.com/repos/acme/orders/pulls/7/files?per_page=100", [
      { filename: "README.md", status: "modified", additions: 1, deletions: 0 },
    ]);

    const { handleChangedEndpoints } = await import("../dist/tools/changed-endpoints.js");
    const result = await handleChangedEndpoints({
      orgId: "acme",
      repo: "orders",
      prNumber: "7",
      serviceId: "svc-orders",
    });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /no changed Java files/i);
  });

  it("testseer_get_changed_endpoints maps changed Java files to endpoints", async () => {
    mockJson("GET", "https://api.github.com/repos/acme/orders/pulls/42/files?per_page=100", [
      { filename: "src/OrderController.java", status: "modified", additions: 5, deletions: 1 },
    ]);
    mockJson(
      "GET",
      `${BASE}/v1/facts/by-file?serviceId=svc-orders&orgId=acme&repo=orders&filePaths=src%2FOrderController.java`,
      {
        schemaVersion: "1.0",
        freshnessStatus: "CURRENT",
        data: [
          {
            symbolFqn: "com.example.OrderController.create",
            symbolKind: "ENDPOINT",
            attributes: JSON.stringify({ httpMethod: "POST", path: "/orders" }),
            evidenceSource: "JAVA",
            confidence: 1,
            indexedAt: "2026-06-01T12:00:00Z",
          },
          {
            symbolFqn: "com.example.OrderController",
            symbolKind: "CLASS",
            attributes: null,
            evidenceSource: "JAVA",
            confidence: 1,
            indexedAt: "2026-06-01T12:00:00Z",
          },
        ],
      }
    );

    const { handleChangedEndpoints } = await import("../dist/tools/changed-endpoints.js");
    const result = await handleChangedEndpoints({
      orgId: "acme",
      repo: "orders",
      prNumber: "42",
      serviceId: "svc-orders",
    });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /PR #42 — Changed Endpoints/);
    assert.match(result.content[0].text, /POST \/orders/);
    const body = JSON.parse(result.content[1].text.split("Full JSON:\n")[1]);
    assert.equal(body.endpoints[0].symbolKind, "ENDPOINT");
  });

  it("testseer_get_changed_endpoints surfaces NOT_INDEXED service", async () => {
    mockJson("GET", "https://api.github.com/repos/acme/orders/pulls/99/files?per_page=100", [
      { filename: "src/Foo.java", status: "added", additions: 10, deletions: 0 },
    ]);
    mockJson(
      "GET",
      `${BASE}/v1/facts/by-file?serviceId=svc-missing&orgId=acme&repo=orders&filePaths=src%2FFoo.java`,
      { schemaVersion: "1.0", freshnessStatus: "NOT_INDEXED", data: null }
    );

    const { handleChangedEndpoints } = await import("../dist/tools/changed-endpoints.js");
    const result = await handleChangedEndpoints({
      orgId: "acme",
      repo: "orders",
      prNumber: "99",
      serviceId: "svc-missing",
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /not been indexed/i);
  });

  // ── Messaging ───────────────────────────────────────────────────────────────

  it("testseer_get_pubsub_inventory", async () => {
    mockJson("GET", `${BASE}/v1/facts/pubsub?serviceId=svc-1&env=pdn`, {
      freshnessStatus: "CURRENT",
      data: [{ shortId: "PDN_T.OFFER_UPDATE", role: "PUBLISH" }],
    });

    const { handlePubSubInventory } = await import("../dist/tools/messaging.js");
    const result = await handlePubSubInventory({ serviceId: "svc-1", env: "pdn" });
    assert.match(result.content[0].text, /Pub\/Sub inventory/);
    const body = JSON.parse(result.content[1].text.slice("Full JSON:\n".length));
    assert.equal(body.data[0].shortId, "PDN_T.OFFER_UPDATE");
  });

  it("testseer_get_pubsub_inventory forwards liveVerify", async () => {
    mockJson("GET", `${BASE}/v1/facts/pubsub?serviceId=svc-1&env=pdn&liveVerify=true`, {
      freshnessStatus: "CURRENT",
      livePubSubStatus: "DISABLED",
      data: [{ shortId: "PDN_S.FOO", role: "SUBSCRIBE" }],
    });

    const { handlePubSubInventory } = await import("../dist/tools/messaging.js");
    const result = await handlePubSubInventory({
      serviceId: "svc-1",
      env: "pdn",
      liveVerify: "true",
    });
    assert.match(result.content[0].text, /Pub\/Sub inventory/);
  });

  it("testseer_get_flow_gates forwards filters", async () => {
    mockJson("GET", `${BASE}/v1/facts/gates?serviceId=svc-1&env=pdn&flowStep=HYVEE_ADAPTER`, {
      freshnessStatus: "CURRENT",
      data: [{ gateKey: "HYVEE_ENABLED", requiredValue: "true" }],
    });

    const { handleFlowGates } = await import("../dist/tools/messaging.js");
    const result = await handleFlowGates({
      serviceId: "svc-1",
      env: "pdn",
      flowStep: "HYVEE_ADAPTER",
    });
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.data[0].gateKey, "HYVEE_ENABLED");
  });

  it("testseer_trace_topic_flow crossRepo mode", async () => {
    mockJson(
      "GET",
      `${BASE}/v1/graph/event-flow/cross-repo?orgId=quotient&shortId=PDN_T.RIQ_OFFER_EVENT&env=pdn`,
      {
        schemaVersion: "1.0",
        freshnessStatus: "CURRENT",
        data: { hops: [{ order: 1, topicShortId: "PDN_T.RIQ_OFFER_EVENT" }] },
      }
    );

    const { handleTraceTopicFlow } = await import("../dist/tools/messaging.js");
    const result = await handleTraceTopicFlow({
      crossRepo: "true",
      orgId: "quotient",
      shortId: "PDN_T.RIQ_OFFER_EVENT",
      env: "pdn",
    });
    assert.match(result.content[0].text, /Cross-repo event flow/);
    const body = JSON.parse(result.content[1].text.slice("Full JSON:\n".length));
    assert.equal(body.data.hops[0].topicShortId, "PDN_T.RIQ_OFFER_EVENT");
  });

  it("testseer_trace_topic_flow crossRepo uses narrative when present", async () => {
    mockJson(
      "GET",
      `${BASE}/v1/graph/event-flow/cross-repo?orgId=quotient&shortId=PDN_T.RIQ_OFFER_EVENT&env=pdn`,
      {
        schemaVersion: "1.0",
        freshnessStatus: "CURRENT",
        data: {
          startTopic: "PDN_T.RIQ_OFFER_EVENT",
          envLane: "pdn",
          hops: [{ order: 1, topicShortId: "PDN_T.RIQ_OFFER_EVENT" }],
          narrative: [
            "Cross-repo trace from PDN_T.RIQ_OFFER_EVENT (1 hop(s), 0 gap(s))",
            "",
            "Hop 1 · PDN_T.RIQ_OFFER_EVENT [PUBSUB]",
          ],
        },
      }
    );

    const { handleTraceTopicFlow } = await import("../dist/tools/messaging.js");
    const result = await handleTraceTopicFlow({
      crossRepo: "true",
      orgId: "quotient",
      shortId: "PDN_T.RIQ_OFFER_EVENT",
      env: "pdn",
    });
    assert.match(result.content[0].text, /Hop 1 · PDN_T\.RIQ_OFFER_EVENT/);
    assert.doesNotMatch(result.content[0].text, /### Hop 1 —/);
  });

  it("testseer_trace_topic_flow crossRepo forwards liveVerify", async () => {
    mockJson(
      "GET",
      `${BASE}/v1/graph/event-flow/cross-repo?orgId=quotient&shortId=PDN_T.RIQ_OFFER_EVENT&env=pdn&liveVerify=true`,
      {
        schemaVersion: "1.0",
        freshnessStatus: "CURRENT",
        livePubSubStatus: "OK",
        livePubSubVerifiedCount: 2,
        data: { hops: [{ order: 1, topicShortId: "PDN_T.RIQ_OFFER_EVENT", subscribers: [] }] },
      }
    );

    const { handleTraceTopicFlow } = await import("../dist/tools/messaging.js");
    const result = await handleTraceTopicFlow({
      crossRepo: "true",
      orgId: "quotient",
      shortId: "PDN_T.RIQ_OFFER_EVENT",
      env: "pdn",
      liveVerify: "true",
    });
    assert.match(result.content[0].text, /Live GCP Pub\/Sub/);
  });

  it("testseer_trace_topic_flow single-repo mode", async () => {
    mockJson(
      "GET",
      `${BASE}/v1/graph/event-flow?serviceId=svc-1&env=pdn&shortId=PDN_T.FOO`,
      {
        freshnessStatus: "CURRENT",
        data: { topicShortId: "PDN_T.FOO", steps: [], gaps: [] },
      }
    );

    const { handleTraceTopicFlow } = await import("../dist/tools/messaging.js");
    const result = await handleTraceTopicFlow({
      serviceId: "svc-1",
      shortId: "PDN_T.FOO",
      env: "pdn",
    });
    assert.match(result.content[0].text, /Single-service event flow/);
    const body = JSON.parse(result.content[1].text.slice("Full JSON:\n".length));
    assert.equal(body.data.topicShortId, "PDN_T.FOO");
  });

  it("testseer_trace_topic_flow crossRepo=true requires shortId", async () => {
    const { handleTraceTopicFlow } = await import("../dist/tools/messaging.js");
    const result = await handleTraceTopicFlow({ crossRepo: "true", orgId: "acme" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /shortId/);
  });

  it("testseer_trace_topic_flow crossRepo=true requires orgId", async () => {
    const { handleTraceTopicFlow } = await import("../dist/tools/messaging.js");
    const result = await handleTraceTopicFlow({ crossRepo: "true", shortId: "PDN_T.FOO" });
    assert.equal(result.isError, true);
  });

  it("testseer_trace_topic_flow single-repo requires serviceId", async () => {
    const { handleTraceTopicFlow } = await import("../dist/tools/messaging.js");
    const result = await handleTraceTopicFlow({});
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /serviceId/);
  });

  // ── External endpoints ──────────────────────────────────────────────────────

  it("testseer_get_external_endpoints forwards optional filters", async () => {
    mockJson(
      "GET",
      `${BASE}/v1/facts/external-endpoints?serviceId=svc-1&env=pdn&partner=hyvee&flowStep=HYVEE_ADAPTER`,
      {
        freshnessStatus: "CURRENT",
        data: [{ partner: "hyvee", url: "https://partner.example/offers" }],
      }
    );

    const { handleExternalEndpoints } = await import("../dist/tools/external-endpoints.js");
    const result = await handleExternalEndpoints({
      serviceId: "svc-1",
      env: "pdn",
      partner: "hyvee",
      flowStep: "HYVEE_ADAPTER",
    });
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.data[0].partner, "hyvee");
  });

  // ── Entry triggers ──────────────────────────────────────────────────────────

  it("testseer_get_entry_triggers calls backend with serviceId", async () => {
    mockJson("GET", `${BASE}/v1/facts/entry-triggers?serviceId=svc-orders`, {
      freshnessStatus: "CURRENT",
      data: [
        { triggerId: "t-1", triggerKind: "REST_INBOUND", httpMethod: "POST", pathPattern: "/orders" },
      ],
    });

    const { handleEntryTriggers } = await import("../dist/tools/entry-triggers.js");
    const result = await handleEntryTriggers({ serviceId: "svc-orders" });
    assert.equal(result.isError, undefined);
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.data[0].triggerId, "t-1");
  });

  it("testseer_get_entry_triggers forwards optional filters", async () => {
    mockJson(
      "GET",
      `${BASE}/v1/facts/entry-triggers?serviceId=svc-1&env=pdn&triggerKind=WEBHOOK_INBOUND&actor=freedom&boundary=EXTERNAL`,
      { freshnessStatus: "CURRENT", data: [] }
    );

    const { handleEntryTriggers } = await import("../dist/tools/entry-triggers.js");
    const result = await handleEntryTriggers({
      serviceId: "svc-1",
      env: "pdn",
      triggerKind: "WEBHOOK_INBOUND",
      actor: "freedom",
      boundary: "EXTERNAL",
    });
    assert.equal(result.isError, undefined);
    const body = JSON.parse(result.content[0].text);
    assert.deepEqual(body.data, []);
  });

  it("testseer_get_entry_triggers reverse impact uses impact endpoint", async () => {
    mockJson(
      "GET",
      `${BASE}/v1/graph/entry-flow/impact?orgId=quotient&handlerFqn=com.example.Foo&env=pdn`,
      {
        freshnessStatus: "CURRENT",
        data: {
          orgId: "quotient",
          handlerFqn: "com.example.Foo",
          triggers: [{ matchKind: "EXACT", serviceId: "svc-1", trigger: { triggerId: "t-1" } }],
        },
      }
    );

    const { handleEntryTriggers } = await import("../dist/tools/entry-triggers.js");
    const result = await handleEntryTriggers({
      orgId: "quotient",
      handlerFqn: "com.example.Foo",
      env: "pdn",
    });
    assert.equal(result.isError, undefined);
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.data.triggers[0].matchKind, "EXACT");
  });

  it("testseer_get_entry_triggers requires orgId with handlerFqn", async () => {
    const { handleEntryTriggers } = await import("../dist/tools/entry-triggers.js");
    const result = await handleEntryTriggers({ handlerFqn: "com.example.Foo" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /orgId is required/);
  });

  it("testseer_trace_entry_flow traces by HTTP path", async () => {
    mockJson(
      "GET",
      `${BASE}/v1/graph/entry-flow?serviceId=svc-orders&path=%2Forders%2Fcreate`,
      {
        freshnessStatus: "CURRENT",
        data: {
          serviceId: "svc-orders",
          envLane: "pdn",
          steps: [
            {
              order: 1,
              trigger: {
                triggerId: "t-1",
                triggerKind: "REST_INBOUND",
                httpMethod: "POST",
                pathPattern: "/orders/create",
              },
              reads: [],
              writes: [{ tableOrEntity: "orders", storeType: "POSTGRES" }],
              gates: [],
            },
          ],
        },
      }
    );

    const { handleTraceEntryFlow } = await import("../dist/tools/entry-triggers.js");
    const result = await handleTraceEntryFlow({ serviceId: "svc-orders", path: "/orders/create" });
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.data.steps[0].writes[0].tableOrEntity, "orders");
  });

  it("testseer_trace_entry_flow traces by triggerId", async () => {
    mockJson("GET", `${BASE}/v1/graph/entry-flow?serviceId=svc-1&triggerId=t-42`, {
      freshnessStatus: "CURRENT",
      data: {
        serviceId: "svc-1",
        steps: [
          {
            order: 1,
            trigger: { triggerId: "t-42", triggerKind: "WEBHOOK_INBOUND" },
            reads: [{ tableOrEntity: "webhooks_log" }],
            writes: [],
            gates: [{ gateKey: "WEBHOOK_ENABLED", requiredValue: "true" }],
          },
        ],
      },
    });

    const { handleTraceEntryFlow } = await import("../dist/tools/entry-triggers.js");
    const result = await handleTraceEntryFlow({ serviceId: "svc-1", triggerId: "t-42" });
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.data.steps[0].gates[0].gateKey, "WEBHOOK_ENABLED");
  });

  it("testseer_trace_entry_flow forwards TRG-12 chain flags", async () => {
    mockJson(
      "GET",
      `${BASE}/v1/graph/entry-flow?serviceId=svc-sub&triggerId=t-1&includeMessaging=true&crossRepo=true&orgId=quotient&maxHops=5`,
      {
        freshnessStatus: "CURRENT",
        data: {
          serviceId: "svc-sub",
          messagingTopicShortId: "PDN_T.RIQ_OFFER_EVENT",
          messagingFlow: { topicShortId: "PDN_T.RIQ_OFFER_EVENT", steps: [{ order: 1 }] },
          crossRepoFlow: { hops: [{ topicShortId: "PDN_T.RIQ_OFFER_EVENT" }] },
          steps: [{ order: 1, trigger: { triggerKind: "PUBSUB_SUBSCRIBE" } }],
        },
      }
    );

    const { handleTraceEntryFlow } = await import("../dist/tools/entry-triggers.js");
    const result = await handleTraceEntryFlow({
      serviceId: "svc-sub",
      triggerId: "t-1",
      includeMessaging: "true",
      crossRepo: "true",
      orgId: "quotient",
      maxHops: "5",
    });
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.data.messagingTopicShortId, "PDN_T.RIQ_OFFER_EVENT");
    assert.equal(body.data.crossRepoFlow.hops.length, 1);
  });

  // ── Consistency ─────────────────────────────────────────────────────────────

  it("testseer_get_consistency_scenarios requires serviceId", async () => {
    const { handleConsistencyScenarios } = await import("../dist/tools/consistency.js");
    const result = await handleConsistencyScenarios({});
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /serviceId is required/);
  });

  it("testseer_get_consistency_scenarios surfaces NOT_INDEXED", async () => {
    mockJson("GET", `${BASE}/v1/consistency/scenarios?serviceId=svc-missing`, {
      schemaVersion: "1.0",
      freshnessStatus: "NOT_INDEXED",
      data: null,
    });

    const { handleConsistencyScenarios } = await import("../dist/tools/consistency.js");
    const result = await handleConsistencyScenarios({ serviceId: "svc-missing" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /not been indexed/i);
  });

  it("testseer_get_consistency_scenarios returns scenario summary", async () => {
    mockJson(
      "GET",
      `${BASE}/v1/consistency/scenarios?serviceId=svc-1&pattern=DUAL_WRITE&flowStep=OFFER_SYNC`,
      {
        schemaVersion: "1.0",
        freshnessStatus: "CURRENT",
        data: [
          {
            scenarioId: "offer-dual-write",
            pattern: "DUAL_WRITE",
            primaryStore: "POSTGRES",
            primaryPhysical: "offers",
            confidence: 0.9,
          },
        ],
      }
    );

    const { handleConsistencyScenarios } = await import("../dist/tools/consistency.js");
    const result = await handleConsistencyScenarios({
      serviceId: "svc-1",
      pattern: "DUAL_WRITE",
      flowStep: "OFFER_SYNC",
    });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /offer-dual-write/);
    assert.match(result.content[0].text, /DUAL_WRITE/);
  });

  // ── Contracts ───────────────────────────────────────────────────────────────

  it("testseer_get_contract_operations", async () => {
    mockJson(
      "GET",
      `${BASE}/v1/facts/contract-operations?serviceId=svc-apis&specDomain=Offers`,
      { freshnessStatus: "CURRENT", data: [{ operationId: "redeemOffer", httpMethod: "POST" }] }
    );

    const { handleContractOperations } = await import("../dist/tools/contracts.js");
    const result = await handleContractOperations({ serviceId: "svc-apis", specDomain: "Offers" });
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.data[0].operationId, "redeemOffer");
  });

  it("testseer_get_contract_gaps", async () => {
    mockJson("GET", `${BASE}/v1/gaps/contract?serviceId=svc-1&specDomain=Offers`, {
      freshnessStatus: "CURRENT",
      data: { contractOnly: [{ operationId: "missingImpl" }], implementationOnly: [] },
    });

    const { handleContractGaps } = await import("../dist/tools/contracts.js");
    const result = await handleContractGaps({ serviceId: "svc-1", specDomain: "Offers" });
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.data.contractOnly[0].operationId, "missingImpl");
  });

  it("testseer_get_contract_schemas", async () => {
    mockJson(
      "GET",
      `${BASE}/v1/facts/contract-schemas?serviceId=svc-apis&schemaId=OfferRequest`,
      { freshnessStatus: "CURRENT", data: [{ schemaId: "OfferRequest", fieldCount: 12 }] }
    );

    const { handleContractSchemas } = await import("../dist/tools/contracts.js");
    const result = await handleContractSchemas({ serviceId: "svc-apis", schemaId: "OfferRequest" });
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.data[0].schemaId, "OfferRequest");
  });

  it("testseer_get_contract_test_coverage_gaps", async () => {
    mockJson(
      "GET",
      `${BASE}/v1/gaps/contract-test-coverage?serviceId=svc-1&testServiceId=svc-tests&specDomain=Offers`,
      { freshnessStatus: "CURRENT", data: { untestedOperations: ["createOffer"] } }
    );

    const { handleContractTestCoverageGaps } = await import("../dist/tools/contracts.js");
    const result = await handleContractTestCoverageGaps({
      serviceId: "svc-1",
      testServiceId: "svc-tests",
      specDomain: "Offers",
    });
    const body = JSON.parse(result.content[0].text);
    assert.deepEqual(body.data.untestedOperations, ["createOffer"]);
  });

  it("testseer_trace_contract_entry_flow", async () => {
    mockJson(
      "GET",
      `${BASE}/v1/graph/contract-entry-flow?serviceId=svc-1&operationId=redeemOffer&env=pdn`,
      {
        freshnessStatus: "CURRENT",
        data: { operationId: "redeemOffer", handlerPath: "/offers/redeem" },
      }
    );

    const { handleContractEntryFlow } = await import("../dist/tools/contracts.js");
    const result = await handleContractEntryFlow({
      serviceId: "svc-1",
      operationId: "redeemOffer",
      env: "pdn",
    });
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.data.operationId, "redeemOffer");
  });

  it("testseer_get_maven_dependencies forwards filters", async () => {
    mockJson(
      "GET",
      `${BASE}/v1/facts/maven-dependencies?serviceId=svc-eval&scope=compile&directOnly=true&artifactId=platform-evaluation-lib`,
      {
        freshnessStatus: "CURRENT",
        data: {
          modules: [{ modulePath: ".", artifactId: "transaction-eval-consumer" }],
          dependencies: [{
            fromModulePath: ".",
            groupId: "com.quotient",
            artifactId: "platform-evaluation-lib",
            version: "2.14.0",
            scope: "compile",
            linkedServiceId: "svc-eval-lib",
          }],
        },
      }
    );

    const { handleMavenDependencies } = await import("../dist/tools/maven-dependencies.js");
    const result = await handleMavenDependencies({
      serviceId: "svc-eval",
      scope: "compile",
      directOnly: "true",
      artifactId: "platform-evaluation-lib",
    });
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.data.dependencies[0].artifactId, "platform-evaluation-lib");
  });

  it("testseer_get_dependency_tree returns hydrated graph", async () => {
    mockJson(
      "GET",
      `${BASE}/v1/graph/dependency-tree?serviceId=svc-eval&depth=2`,
      {
        freshnessStatus: "CURRENT",
        data: {
          rootModulePath: ".",
          edges: [{ from: "svc-eval::maven::.", to: "artifact::com.quotient:platform-evaluation-lib" }],
          nodes: [{ id: "svc-eval::maven::.", nodeType: "MAVEN_MODULE" }],
        },
      }
    );

    const { handleDependencyTree } = await import("../dist/tools/maven-dependencies.js");
    const result = await handleDependencyTree({ serviceId: "svc-eval", depth: "2" });
    const body = JSON.parse(result.content[0].text);
    assert.equal(body.data.edges.length, 1);
  });
});
