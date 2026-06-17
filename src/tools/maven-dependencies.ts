import { getDependencyTree, getMavenDependencies } from "../client.js";

export const mavenDependenciesTool = {
  name: "testseer_get_maven_dependencies",
  description:
    "List indexed Maven modules and dependency facts for a service (BL-058). " +
    "Filter by modulePath, scope (runtime/compile/test/all), or artifact coordinates.",
  inputSchema: {
    type: "object" as const,
    properties: {
      serviceId: { type: "string", description: "Registered service ID" },
      orgId: { type: "string", description: "Organisation ID (default acme)" },
      repo: { type: "string", description: "Repository name for cache key" },
      modulePath: { type: "string", description: "Maven module path within repo" },
      scope: { type: "string", description: "Maven scope filter (default runtime)" },
      directOnly: { type: "boolean", description: "If true, omit transitive deps" },
      groupId: { type: "string", description: "Filter by dependency groupId" },
      artifactId: { type: "string", description: "Filter by dependency artifactId" },
    },
    required: ["serviceId"],
  },
};

export const dependencyTreeTool = {
  name: "testseer_get_dependency_tree",
  description:
    "BFS Maven dependency tree with optional hydrated graph nodes/edges (BL-058). " +
    "Separate from class reachability — uses DEPENDS_ON_ARTIFACT edges.",
  inputSchema: {
    type: "object" as const,
    properties: {
      serviceId: { type: "string", description: "Registered service ID" },
      orgId: { type: "string", description: "Organisation ID" },
      repo: { type: "string", description: "Repository name for cache key" },
      modulePath: { type: "string", description: "Root module path (default primary module)" },
      scope: { type: "string", description: "Maven scope (default runtime)" },
      depth: { type: "number", description: "Transitive hop depth (default 3)" },
      hydrate: { type: "boolean", description: "Include nodes[] and edges[] (default true)" },
      includeExternal: { type: "boolean", description: "Include non-com.quotient artifacts (default true)" },
    },
    required: ["serviceId"],
  },
};

export async function handleMavenDependencies(args: Record<string, string>) {
  const result = await getMavenDependencies({
    serviceId: args.serviceId,
    orgId: args.orgId,
    repo: args.repo,
    modulePath: args.modulePath,
    scope: args.scope,
    directOnly: args.directOnly === "true",
    groupId: args.groupId,
    artifactId: args.artifactId,
  });
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
  };
}

export async function handleDependencyTree(args: Record<string, string>) {
  const depth = args.depth ? Number(args.depth) : undefined;
  const result = await getDependencyTree({
    serviceId: args.serviceId,
    orgId: args.orgId,
    repo: args.repo,
    modulePath: args.modulePath,
    scope: args.scope,
    depth,
    hydrate: args.hydrate !== "false",
    includeExternal: args.includeExternal !== "false",
  });
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
  };
}
