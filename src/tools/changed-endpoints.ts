import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getPrFiles, getSymbolsByFile } from "../client.js";

export const changedEndpointsTool: Tool = {
  name: "testseer_get_changed_endpoints",
  description:
    "Given a GitHub pull request number, fetch the PR's changed files and map them to their " +
    "indexed endpoints and classes in TestSeer. Works even if the PR commit has not been indexed — " +
    "it uses the most recent complete index to identify what endpoints live in the changed files. " +
    "Returns changed files, their endpoints (HTTP method + path), and the classes they belong to. " +
    "Use this at the start of a code review to understand which API surface is being modified.",
  inputSchema: {
    type: "object",
    properties: {
      orgId: { type: "string", description: "GitHub organisation (e.g. 'acme')" },
      repo: { type: "string", description: "GitHub repository name (e.g. 'orders')" },
      prNumber: { type: "number", description: "Pull request number" },
      serviceId: {
        type: "string",
        description: "TestSeer serviceId. Use testseer_detect_service if unknown.",
      },
    },
    required: ["orgId", "repo", "prNumber", "serviceId"],
  },
};

export async function handleChangedEndpoints(args: Record<string, string>) {
  const { orgId, repo, serviceId } = args;
  const prNumber = parseInt(args.prNumber, 10);

  if (!orgId || !repo || !serviceId || isNaN(prNumber)) {
    return {
      content: [
        {
          type: "text" as const,
          text: "orgId, repo, prNumber, and serviceId are all required.",
        },
      ],
      isError: true,
    };
  }

  try {
    const prFiles = await getPrFiles(orgId, repo, prNumber);
    const javaFiles = prFiles
      .filter((f) => f.filename.endsWith(".java") && f.status !== "removed")
      .map((f) => f.filename);

    if (javaFiles.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `PR #${prNumber} has no changed Java files (${prFiles.length} total files changed).`,
          },
        ],
      };
    }

    const { data: envelope } = await getSymbolsByFile(serviceId, javaFiles, orgId, repo);

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

    const symbols = envelope.data;
    const endpoints = symbols.filter((s) => s.symbolKind === "ENDPOINT");
    const classes = symbols.filter((s) => s.symbolKind === "CLASS");

    const lines: string[] = [
      `## PR #${prNumber} — Changed Endpoints`,
      `**${javaFiles.length}** Java files changed, touching **${endpoints.length}** indexed endpoints across **${classes.length}** classes.\n`,
    ];

    if (endpoints.length > 0) {
      lines.push("### Changed endpoints");
      endpoints.forEach((ep) => {
        let attrs: Record<string, string> = {};
        try {
          attrs = JSON.parse(ep.attributes ?? "{}");
        } catch {
          /* ignore */
        }
        const method = attrs.httpMethod ?? "?";
        const path = attrs.path ?? ep.symbolFqn;
        lines.push(`- \`${method} ${path}\` — \`${ep.symbolFqn}\``);
      });
    }

    if (classes.length > 0) {
      lines.push("\n### Changed classes");
      classes.forEach((c) => lines.push(`- \`${c.symbolFqn}\``));
    }

    lines.push("\n### Changed files");
    javaFiles.forEach((f) => lines.push(`- \`${f}\``));

    lines.push(
      `\n**Next:** Call \`testseer_get_impact\` with serviceId="${serviceId}" and the PR's head commit SHA ` +
        `to see which upstream services may be affected.`
    );

    return {
      content: [
        { type: "text" as const, text: lines.join("\n") },
        {
          type: "text" as const,
          text:
            "\nFull JSON:\n" +
            JSON.stringify({ javaFiles, endpoints, classes }, null, 2),
        },
      ],
    };
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: `Error: ${err}` }],
      isError: true,
    };
  }
}
