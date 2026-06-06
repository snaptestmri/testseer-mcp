import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getGaps } from "../client.js";

export const gapsTool: Tool = {
  name: "testseer_get_gaps",
  description:
    "Identify production classes and controllers that have no test class. " +
    "Returns counts and a prioritised list: ENDPOINT_CONTROLLER gaps are highest priority " +
    "as they expose untested HTTP endpoints. Use this to understand overall test coverage " +
    "debt for a service and to decide which tests to write first.",
  inputSchema: {
    type: "object",
    properties: {
      serviceId: { type: "string", description: "TestSeer serviceId" },
    },
    required: ["serviceId"],
  },
};

export async function handleGaps(args: Record<string, string>) {
  const { serviceId } = args;
  if (!serviceId) {
    return {
      content: [{ type: "text" as const, text: "serviceId is required." }],
      isError: true,
    };
  }

  try {
    const envelope = await getGaps(serviceId);

    if (envelope.freshnessStatus === "NOT_INDEXED") {
      return {
        content: [
          { type: "text" as const, text: `Service ${serviceId} has not been indexed.` },
        ],
        isError: true,
      };
    }

    const r = envelope.data;
    const coverage =
      r.productionClassCount > 0
        ? Math.round((r.testedClassCount / r.productionClassCount) * 100)
        : 0;

    const lines = [
      `## Test Gap Report — ${serviceId}`,
      `Coverage: **${coverage}%** (${r.testedClassCount}/${r.productionClassCount} classes have tests)`,
      `Untested: **${r.untestedClassCount}** classes\n`,
    ];

    const controllers = r.gaps.filter((g) => g.kind === "ENDPOINT_CONTROLLER");
    const classes = r.gaps.filter((g) => g.kind === "CLASS");

    if (controllers.length > 0) {
      lines.push(`### ⚠️ Untested controllers (highest priority — ${controllers.length})`);
      controllers.forEach((g) => lines.push(`- \`${g.classFqn}\``));
    }

    if (classes.length > 0) {
      lines.push(`\n### Untested classes (${classes.length})`);
      classes.slice(0, 20).forEach((g) => lines.push(`- \`${g.classFqn}\``));
      if (classes.length > 20) lines.push(`  ... and ${classes.length - 20} more`);
    }

    return {
      content: [
        { type: "text" as const, text: lines.join("\n") },
        { type: "text" as const, text: "\nFull JSON:\n" + JSON.stringify(r, null, 2) },
      ],
    };
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: `Error: ${err}` }],
      isError: true,
    };
  }
}
