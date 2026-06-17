const BASE_URL = process.env.TESTSEER_URL ?? "http://localhost:8080";

export const MCP_CLIENT = "testseer-mcp/1.0.0";

export interface FetchMeta {
  requestId: string;
  durationMs: number;
}

export interface FetchResult<T> {
  data: T;
  meta: FetchMeta;
  status: number;
}

export interface ApiError {
  error: string;
  message: string;
  hint?: string;
  requestId: string;
  errors?: string[];
}

export interface ServiceDescriptionResponse {
  serviceId: string;
  description: string;
  generatedAt: string | null;
  model: string;
}

async function formatApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiError;
    if (body.message) {
      return body.hint ? `${body.message} (${body.hint})` : body.message;
    }
  } catch {
    // non-JSON body
  }
  return response.statusText || "request failed";
}

async function fetchBackend<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    tool?: string;
  } = {}
): Promise<{ response: Response; meta: FetchMeta }> {
  const requestId = crypto.randomUUID();
  const start = Date.now();
  const headers: Record<string, string> = {
    "X-Request-Id": requestId,
    "X-TestSeer-Client": MCP_CLIENT,
    "X-TestSeer-Api-Version": "1",
  };
  if (options.tool) {
    headers["X-MCP-Tool"] = options.tool;
  }
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  return {
    response,
    meta: { requestId, durationMs: Date.now() - start },
  };
}

export async function get<T>(path: string, tool?: string): Promise<FetchResult<T>> {
  const { response, meta } = await fetchBackend(path, { tool });
  if (!response.ok) {
    const detail = await formatApiError(response);
    throw new Error(`TestSeer API error ${response.status} for GET ${path}: ${detail}`);
  }
  const data = (await response.json()) as T;
  return { data, meta, status: response.status };
}

async function post<T>(path: string, body?: unknown, tool?: string): Promise<FetchResult<T>> {
  const { response, meta } = await fetchBackend(path, { method: "POST", body, tool });
  if (!response.ok) {
    const detail = await formatApiError(response);
    throw new Error(`TestSeer API error ${response.status} for POST ${path}: ${detail}`);
  }
  const data = body === undefined && response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
  return { data, meta, status: response.status };
}

export interface ResponseEnvelope<T> {
  schemaVersion: string;
  indexedAt: string | null;
  commitSha: string | null;
  freshnessStatus: "CURRENT" | "STALE" | "INDEXING" | "NOT_INDEXED";
  data: T;
}

export interface ImpactReport {
  serviceId: string;
  commitSha: string;
  changedSymbols: ChangedSymbol[];
  affectedConsumers: AffectedConsumer[];
  downstreamDependencies: DownstreamDependency[];
  suggestedTestScope: SuggestedTest[];
  missingTestClasses: string[];
}

export interface ChangedSymbol {
  symbolFqn: string;
  symbolKind: string;
  filePath: string;
  httpMethod: string | null;
  path: string | null;
}

export interface AffectedConsumer {
  source: string;
  consumerServiceId: string;
  consumerServiceName: string;
  consumerClass: string;
  nodeType: string;
  httpMethod: string | null;
  path: string | null;
}

export interface DownstreamDependency {
  callerClass: string;
  httpMethod: string | null;
  path: string | null;
}

export interface SuggestedTest {
  type: string;
  className: string | null;
  targetService: string | null;
  exists: boolean;
  reason: string;
}

export interface GapReport {
  serviceId: string;
  commitSha: string | null;
  productionClassCount: number;
  testedClassCount: number;
  untestedClassCount: number;
  gaps: ClassGap[];
}

export interface ClassGap {
  classFqn: string;
  filePath: string;
  kind: string;
}

export interface ServiceEntry {
  serviceId: string;
  orgId: string;
  repo: string;
  serviceName: string;
  moduleType: string;
  buildTool: string;
  enabled: boolean;
}

export interface StatusData {
  serviceId: string;
  indexedAt: string;
  commitSha: string;
}

export interface SymbolFactView {
  symbolFqn: string;
  symbolKind: string;
  attributes: string | null;
  evidenceSource: string;
  confidence: number;
  indexedAt: string;
}

export async function getImpact(
  serviceId: string,
  commitSha: string
): Promise<FetchResult<ResponseEnvelope<ImpactReport>>> {
  return get(
    `/v1/impact/pr?serviceId=${encodeURIComponent(serviceId)}&commitSha=${encodeURIComponent(commitSha)}`,
    "testseer_get_impact"
  );
}

export async function getGaps(serviceId: string): Promise<FetchResult<ResponseEnvelope<GapReport>>> {
  return get(`/v1/gaps?serviceId=${encodeURIComponent(serviceId)}`, "testseer_get_gaps");
}

export interface ConsistencyScenario {
  scenarioId: string;
  pattern: string;
  scopeKind: string;
  scopeRef: string;
  primaryStore: string;
  primaryPhysical: string;
  correlationKeys: string;
  participants: string;
  pollStrategy: string;
  invariants: string;
  evidenceSource: string;
  confidence: number;
  attributes: string | null;
}

export async function getConsistencyScenarios(
  query: string
): Promise<FetchResult<ResponseEnvelope<ConsistencyScenario[]>>> {
  return get(`/v1/consistency/scenarios?${query}`, "testseer_get_consistency_scenarios");
}

export async function getContractOperations(
  query: string
): Promise<FetchResult<ResponseEnvelope<unknown>>> {
  return get(`/v1/facts/contract-operations?${query}`, "testseer_get_contract_operations");
}

export async function getContractGaps(
  query: string
): Promise<FetchResult<ResponseEnvelope<unknown>>> {
  return get(`/v1/gaps/contract?${query}`, "testseer_get_contract_gaps");
}

export async function getContractEntryFlow(
  query: string
): Promise<FetchResult<ResponseEnvelope<unknown>>> {
  return get(`/v1/graph/contract-entry-flow?${query}`, "testseer_trace_contract_entry_flow");
}

export async function getContractSchemas(
  query: string
): Promise<FetchResult<ResponseEnvelope<unknown>>> {
  return get(`/v1/facts/contract-schemas?${query}`, "testseer_get_contract_schemas");
}

export async function getContractTestCoverageGaps(
  query: string
): Promise<FetchResult<ResponseEnvelope<unknown>>> {
  return get(`/v1/gaps/contract-test-coverage?${query}`, "testseer_get_contract_test_coverage_gaps");
}

export async function getServiceStatus(
  serviceId: string
): Promise<FetchResult<ResponseEnvelope<StatusData>>> {
  return get(`/v1/status/${encodeURIComponent(serviceId)}`, "testseer_get_service_status");
}

export async function getServiceDescription(
  serviceId: string
): Promise<FetchResult<ServiceDescriptionResponse>> {
  const { response, meta } = await fetchBackend(
    `/v1/services/${encodeURIComponent(serviceId)}/description`,
    { tool: "testseer_get_service_description" }
  );
  if (response.status === 404) {
    return {
      data: {
        serviceId,
        description: "No description generated yet.",
        generatedAt: null,
        model: "",
      },
      meta,
      status: 404,
    };
  }
  if (!response.ok) {
    const detail = await formatApiError(response);
    throw new Error(`TestSeer API error ${response.status}: ${detail}`);
  }
  const data = (await response.json()) as ServiceDescriptionResponse;
  return { data, meta, status: response.status };
}

export async function listServices(): Promise<FetchResult<ServiceEntry[]>> {
  return get("/registry/services", "testseer_list_services");
}

export async function findServiceByRepo(
  orgId: string,
  serviceName: string
): Promise<ServiceEntry | null> {
  const { data: all } = await listServices();
  return (
    all.find(
      (s) =>
        s.orgId === orgId &&
        (s.repo === serviceName || s.serviceName === serviceName)
    ) ?? null
  );
}

export async function triggerIndex(
  serviceId: string,
  commitSha?: string
): Promise<FetchResult<unknown>> {
  return post(
    `/admin/index/${encodeURIComponent(serviceId)}`,
    commitSha ? { commitSha } : {},
    "testseer_trigger_index"
  );
}

// ---- GitHub PR integration ----

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export interface PrFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
}

export async function getPrFiles(
  orgId: string,
  repo: string,
  prNumber: number
): Promise<PrFile[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;

  const response = await fetch(
    `https://api.github.com/repos/${orgId}/${repo}/pulls/${prNumber}/files?per_page=100`,
    { headers }
  );
  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status} for PR ${prNumber}`);
  }
  return response.json() as Promise<PrFile[]>;
}

export async function getSymbolsByFile(
  serviceId: string,
  filePaths: string[],
  orgId: string,
  repo = ""
): Promise<FetchResult<ResponseEnvelope<SymbolFactView[]>>> {
  const params = new URLSearchParams({ serviceId, orgId, repo });
  filePaths.forEach((p) => params.append("filePaths", p));
  return get<ResponseEnvelope<SymbolFactView[]>>(
    `/v1/facts/by-file?${params}`,
    "testseer_get_changed_endpoints"
  );
}

export async function getPubSubInventory(query: string): Promise<FetchResult<ResponseEnvelope<unknown>>> {
  return get(`/v1/facts/pubsub?${query}`, "testseer_get_pubsub_inventory");
}

export async function getEventFlow(query: string): Promise<FetchResult<ResponseEnvelope<unknown>>> {
  return get(`/v1/graph/event-flow?${query}`, "testseer_trace_topic_flow");
}

export async function getCrossRepoEventFlow(query: string): Promise<FetchResult<ResponseEnvelope<unknown>>> {
  return get(`/v1/graph/event-flow/cross-repo?${query}`, "testseer_trace_topic_flow");
}

export async function clearIndex(body: Record<string, unknown>): Promise<FetchResult<unknown>> {
  return post("/admin/index/clear", body, "testseer_clear_index");
}

export async function getFlowGates(query: string): Promise<FetchResult<ResponseEnvelope<unknown>>> {
  return get(`/v1/facts/gates?${query}`, "testseer_get_flow_gates");
}

export async function getMavenDependencies(params: {
  serviceId: string;
  orgId?: string;
  repo?: string;
  modulePath?: string;
  scope?: string;
  directOnly?: boolean;
  groupId?: string;
  artifactId?: string;
}): Promise<FetchResult<ResponseEnvelope<unknown>>> {
  const q = new URLSearchParams({ serviceId: params.serviceId });
  if (params.orgId) q.set("orgId", params.orgId);
  if (params.repo) q.set("repo", params.repo);
  if (params.modulePath) q.set("modulePath", params.modulePath);
  if (params.scope) q.set("scope", params.scope);
  if (params.directOnly) q.set("directOnly", "true");
  if (params.groupId) q.set("groupId", params.groupId);
  if (params.artifactId) q.set("artifactId", params.artifactId);
  return get(`/v1/facts/maven-dependencies?${q}`, "testseer_get_maven_dependencies");
}

export async function getDependencyTree(params: {
  serviceId: string;
  orgId?: string;
  repo?: string;
  modulePath?: string;
  scope?: string;
  depth?: number;
  hydrate?: boolean;
  includeExternal?: boolean;
}): Promise<FetchResult<ResponseEnvelope<unknown>>> {
  const q = new URLSearchParams({ serviceId: params.serviceId });
  if (params.orgId) q.set("orgId", params.orgId);
  if (params.repo) q.set("repo", params.repo);
  if (params.modulePath) q.set("modulePath", params.modulePath);
  if (params.scope) q.set("scope", params.scope);
  if (params.depth != null) q.set("depth", String(params.depth));
  if (params.hydrate === false) q.set("hydrate", "false");
  if (params.includeExternal === false) q.set("includeExternal", "false");
  return get(`/v1/graph/dependency-tree?${q}`, "testseer_get_dependency_tree");
}

export async function getExternalEndpoints(
  query: string
): Promise<FetchResult<ResponseEnvelope<unknown>>> {
  return get(`/v1/facts/external-endpoints?${query}`, "testseer_get_external_endpoints");
}

export async function getEntryTriggers(
  query: string
): Promise<FetchResult<ResponseEnvelope<unknown>>> {
  return get(`/v1/facts/entry-triggers?${query}`, "testseer_get_entry_triggers");
}

export async function getEntryTriggerImpact(
  query: string
): Promise<FetchResult<ResponseEnvelope<unknown>>> {
  return get(`/v1/graph/entry-flow/impact?${query}`, "testseer_get_entry_triggers");
}

export async function traceEntryFlow(
  query: string
): Promise<FetchResult<ResponseEnvelope<unknown>>> {
  return get(`/v1/graph/entry-flow?${query}`, "testseer_trace_entry_flow");
}
