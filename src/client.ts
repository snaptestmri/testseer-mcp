const BASE_URL = process.env.TESTSEER_URL ?? "http://localhost:8080";

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`TestSeer API error ${response.status} for GET ${path}`);
  }
  return response.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`TestSeer API error ${response.status} for POST ${path}`);
  }
  return response.json() as Promise<T>;
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
): Promise<ResponseEnvelope<ImpactReport>> {
  return get(
    `/v1/impact/pr?serviceId=${encodeURIComponent(serviceId)}&commitSha=${encodeURIComponent(commitSha)}`
  );
}

export async function getGaps(serviceId: string): Promise<ResponseEnvelope<GapReport>> {
  return get(`/v1/gaps?serviceId=${encodeURIComponent(serviceId)}`);
}

export async function getServiceStatus(
  serviceId: string
): Promise<ResponseEnvelope<StatusData>> {
  return get(`/v1/status/${encodeURIComponent(serviceId)}`);
}

export async function getServiceDescription(serviceId: string): Promise<string> {
  const response = await fetch(
    `${BASE_URL}/v1/services/${encodeURIComponent(serviceId)}/description`
  );
  if (response.status === 404) return "No description generated yet.";
  if (!response.ok) throw new Error(`TestSeer API error ${response.status}`);
  return response.text();
}

export async function listServices(): Promise<ServiceEntry[]> {
  return get("/registry/services");
}

export async function findServiceByRepo(
  orgId: string,
  serviceName: string
): Promise<ServiceEntry | null> {
  const all = await listServices();
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
): Promise<unknown> {
  return post(
    `/admin/index/${encodeURIComponent(serviceId)}`,
    commitSha ? { commitSha } : {}
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
  orgId = "acme",
  repo = ""
): Promise<ResponseEnvelope<SymbolFactView[]>> {
  const params = new URLSearchParams({ serviceId, orgId, repo });
  filePaths.forEach((p) => params.append("filePaths", p));
  return get<ResponseEnvelope<SymbolFactView[]>>(`/v1/facts/by-file?${params}`);
}
