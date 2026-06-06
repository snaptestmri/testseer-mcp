import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { detectTool, handleDetect } from "./tools/detect.js";
import { impactTool, handleImpact } from "./tools/impact.js";
import { gapsTool, handleGaps } from "./tools/gaps.js";
import { serviceTools, handleServiceTool } from "./tools/services.js";
import { indexTool, handleIndex } from "./tools/index.js";
import {
  changedEndpointsTool,
  handleChangedEndpoints,
} from "./tools/changed-endpoints.js";

const server = new Server(
  { name: "testseer", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

const allTools = [
  detectTool,
  impactTool,
  gapsTool,
  ...serviceTools,
  indexTool,
  changedEndpointsTool,
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: allTools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, string>;

  switch (name) {
    case "testseer_detect_service":
      return handleDetect(a);
    case "testseer_get_impact":
      return handleImpact(a);
    case "testseer_get_gaps":
      return handleGaps(a);
    case "testseer_list_services":
    case "testseer_get_service_status":
    case "testseer_get_service_description":
      return handleServiceTool(name, a);
    case "testseer_trigger_index":
      return handleIndex(a);
    case "testseer_get_changed_endpoints":
      return handleChangedEndpoints(a);
    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
