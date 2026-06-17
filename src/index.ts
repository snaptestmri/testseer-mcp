import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { withToolObservability } from "./observability.js";
import { detectTool, handleDetect } from "./tools/detect.js";
import { impactTool, handleImpact } from "./tools/impact.js";
import { gapsTool, handleGaps } from "./tools/gaps.js";
import { serviceTools, handleServiceTool } from "./tools/services.js";
import { indexTool, handleIndex } from "./tools/index.js";
import {
  changedEndpointsTool,
  handleChangedEndpoints,
} from "./tools/changed-endpoints.js";
import {
  pubsubInventoryTool,
  traceTopicFlowTool,
  flowGatesTool,
  handlePubSubInventory,
  handleTraceTopicFlow,
  handleFlowGates,
} from "./tools/messaging.js";
import { clearIndexTool, handleClearIndex } from "./tools/clear-index.js";
import {
  externalEndpointsTool,
  handleExternalEndpoints,
} from "./tools/external-endpoints.js";
import {
  entryTriggersTool,
  traceEntryFlowTool,
  handleEntryTriggers,
  handleTraceEntryFlow,
} from "./tools/entry-triggers.js";
import {
  consistencyScenariosTool,
  handleConsistencyScenarios,
} from "./tools/consistency.js";
import {
  contractGapsTool,
  contractOperationsTool,
  handleContractGaps,
  handleContractOperations,
  handleContractEntryFlow,
  contractEntryFlowTool,
  contractSchemasTool,
  contractTestCoverageGapsTool,
  handleContractSchemas,
  handleContractTestCoverageGaps,
} from "./tools/contracts.js";
import {
  serviceFlowDiagramTool,
  handleServiceFlowDiagram,
} from "./tools/flow-diagram.js";
import {
  mavenDependenciesTool,
  dependencyTreeTool,
  handleMavenDependencies,
  handleDependencyTree,
} from "./tools/maven-dependencies.js";

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
  pubsubInventoryTool,
  traceTopicFlowTool,
  flowGatesTool,
  clearIndexTool,
  externalEndpointsTool,
  entryTriggersTool,
  traceEntryFlowTool,
  consistencyScenariosTool,
  contractOperationsTool,
  contractGapsTool,
  contractSchemasTool,
  contractTestCoverageGapsTool,
  contractEntryFlowTool,
  serviceFlowDiagramTool,
  mavenDependenciesTool,
  dependencyTreeTool,
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: allTools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, string>;

  switch (name) {
    case "testseer_detect_service":
      return withToolObservability(name, () => handleDetect(a));
    case "testseer_get_impact":
      return withToolObservability(name, () => handleImpact(a));
    case "testseer_get_gaps":
      return withToolObservability(name, () => handleGaps(a));
    case "testseer_list_services":
    case "testseer_get_service_status":
    case "testseer_get_service_description":
      return withToolObservability(name, () => handleServiceTool(name, a));
    case "testseer_trigger_index":
      return withToolObservability(name, () => handleIndex(a));
    case "testseer_get_changed_endpoints":
      return withToolObservability(name, () => handleChangedEndpoints(a));
    case "testseer_get_pubsub_inventory":
      return withToolObservability(name, () => handlePubSubInventory(a));
    case "testseer_trace_topic_flow":
      return withToolObservability(name, () => handleTraceTopicFlow(a));
    case "testseer_get_flow_gates":
      return withToolObservability(name, () => handleFlowGates(a));
    case "testseer_clear_index":
      return withToolObservability(name, () => handleClearIndex(a));
    case "testseer_get_external_endpoints":
      return withToolObservability(name, () => handleExternalEndpoints(a));
    case "testseer_get_entry_triggers":
      return withToolObservability(name, () => handleEntryTriggers(a));
    case "testseer_trace_entry_flow":
      return withToolObservability(name, () => handleTraceEntryFlow(a));
    case "testseer_get_consistency_scenarios":
      return withToolObservability(name, () => handleConsistencyScenarios(a));
    case "testseer_get_contract_operations":
      return withToolObservability(name, () => handleContractOperations(a));
    case "testseer_get_contract_gaps":
      return withToolObservability(name, () => handleContractGaps(a));
    case "testseer_get_contract_schemas":
      return withToolObservability(name, () => handleContractSchemas(a));
    case "testseer_get_contract_test_coverage_gaps":
      return withToolObservability(name, () => handleContractTestCoverageGaps(a));
    case "testseer_trace_contract_entry_flow":
      return withToolObservability(name, () => handleContractEntryFlow(a));
    case "testseer_get_service_flow_diagram":
      return withToolObservability(name, () => handleServiceFlowDiagram(a));
    case "testseer_get_maven_dependencies":
      return withToolObservability(name, () => handleMavenDependencies(a));
    case "testseer_get_dependency_tree":
      return withToolObservability(name, () => handleDependencyTree(a));
    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
