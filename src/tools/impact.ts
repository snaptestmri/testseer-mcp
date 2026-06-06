import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getImpact, ImpactReport } from "../client.js";

export const impactTool: Tool = {
  name: "testseer_get_impact",
  description:
    "Get test impact analysis for a service at a specific commit. " +
    "Returns: (1) symbols changed at this commit, (2) upstream services that call changed endpoints " +
    "and may be broken, (3) downstream services this service depends on through changed classes, " +
    "(4) suggested unit and integration test classes to run, (5) production classes with no test class. " +
    "Use this when a developer has made changes and wants to know what to test.",
  inputSchema: {
    type: "object",
    properties: {
      serviceId: {
        type: "string",
        description: "TestSeer serviceId (use testseer_detect_service to find it)",
      },
      commitSha: {
        type: "string",
        description: "Git commit SHA to analyse (use git HEAD for current changes)",
      },
    },
    required: ["serviceId", "commitSha"],
  },
};

export async function handleImpact(args: Record<string, string>) {
  const { serviceId, commitSha } = args;
  if (!serviceId || !commitSha) {
    return {
      content: [{ type: "text" as const, text: "serviceId and commitSha are required." }],
      isError: true,
    };
  }

  try {
    const envelope = await getImpact(serviceId, commitSha);

    if (envelope.freshnessStatus === "NOT_INDEXED") {
      return {
        content: [
          {
            type: "text" as const,
            text: `Service ${serviceId} has not been indexed. Run testseer_trigger_index first.`,
          },
        ],
        isError: true,
      };
    }

    const r = envelope.data;
    const summary = formatImpactSummary(r, envelope.freshnessStatus);

    return {
      content: [
        { type: "text" as const, text: summary },
        { type: "text" as const, text: "\n\nFull JSON:\n" + JSON.stringify(r, null, 2) },
      ],
    };
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: `Error: ${err}` }],
      isError: true,
    };
  }
}

function formatImpactSummary(r: ImpactReport, freshness: string): string {
  const lines: string[] = [];

  lines.push(`## Impact Analysis — ${r.serviceId} @ ${r.commitSha.slice(0, 8)}`);
  lines.push(`Freshness: ${freshness}\n`);

  if (r.changedSymbols.length === 0) {
    lines.push("No symbols changed at this commit.");
    return lines.join("\n");
  }

  lines.push(`### Changed (${r.changedSymbols.length})`);
  r.changedSymbols.forEach((s) => {
    const ep = s.httpMethod ? ` [${s.httpMethod} ${s.path}]` : "";
    lines.push(`- ${s.symbolKind}: \`${s.symbolFqn}\`${ep}`);
  });

  if (r.affectedConsumers.length > 0) {
    lines.push(`\n### Upstream callers affected (${r.affectedConsumers.length})`);
    r.affectedConsumers.forEach((c) =>
      lines.push(
        `- **${c.consumerServiceName}** calls \`${c.httpMethod ?? "?"} ${c.path ?? "?"}\` via \`${c.consumerClass}\` (${c.source})`
      )
    );
  }

  if (r.downstreamDependencies.length > 0) {
    lines.push(`\n### Downstream dependencies (${r.downstreamDependencies.length})`);
    r.downstreamDependencies.forEach((d) =>
      lines.push(`- \`${d.callerClass}\` → \`${d.httpMethod ?? "?"} ${d.path ?? "?"}\``)
    );
  }

  if (r.suggestedTestScope.length > 0) {
    lines.push(`\n### Suggested tests`);
    r.suggestedTestScope.forEach((t) => {
      const missing = !t.exists ? " ⚠️" : "";
      const label =
        t.type === "UNIT"
          ? t.className
            ? `\`${t.className}\`${missing}`
            : `(no test class)${missing}`
          : `Integration with **${t.targetService}**${missing}`;
      lines.push(`- ${t.type}: ${label} — ${t.reason}`);
    });
  }

  if (r.missingTestClasses.length > 0) {
    lines.push(`\n### ⚠️ Missing test classes (${r.missingTestClasses.length})`);
    r.missingTestClasses.forEach((c) => lines.push(`- \`${c}\``));
  }

  return lines.join("\n");
}
