# TestSeer MCP Server

> **Status:** Canonical  
> **Last verified:** 2026-06-15

[MCP](https://modelcontextprotocol.io) server that wraps the [TestSeer backend](https://github.com/snaptestmri/testseer-backend) REST API as tools for Cursor agents. When you're editing a Java service, the agent can call `testseer_get_impact` or `testseer_get_changed_endpoints` and receive structured analysis to generate test suggestions inline.

## Prerequisites

- Node.js 20+
- [TestSeer backend](https://github.com/snaptestmri/testseer-backend) running (default: `http://localhost:8080`)
- GitHub PAT with `repo` read scope (for PR analysis only)

## Setup

### 1. Install and build

```bash
# From repo root (checks node health, reinstall hint if simdjson broken):
../scripts/build-mcp.sh

# Or manually:
npm install
npm run build
```

**Node broken after Homebrew upgrade?** If `node --version` fails with `libsimdjson.30.dylib not loaded`:

```bash
brew reinstall node
# or pin LTS via nvm:
nvm install 22 && nvm use 22   # .nvmrc specifies 22
```

This happens when Homebrew upgrades `simdjson` but the existing `node` bottle was linked against an older ABI.

### 2. Configure Cursor

Add to your Java project's `.cursor/mcp.json` (copy from [`cursor-config/mcp.json`](cursor-config/mcp.json)):

```json
{
  "mcpServers": {
    "testseer": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/testseer-mcp",
      "env": {
        "TESTSEER_URL": "http://localhost:8080",
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

Restart Cursor after saving.

### 3. Optional — auto-detect serviceId

Add `.testseer/config.yml` to your service repo root:

```yaml
serviceId: "your-service-uuid"
orgId: "acme"
repo: "orders"
```

See [`.testseer-config-example.yml`](.testseer-config-example.yml) for the full format.

## Tools

| Tool | Description |
|------|-------------|
| `testseer_detect_service` | Auto-detect serviceId from `.testseer/config.yml` or git remote |
| `testseer_get_impact` | Impact analysis for a commit — changed symbols, callers, test suggestions |
| `testseer_get_gaps` | Production classes with no test class — portfolio `/v1/gaps` |
| `testseer_list_services` | List all registered services |
| `testseer_get_service_status` | Freshness: `CURRENT` / `STALE` / `INDEXING` / `NOT_INDEXED` |
| `testseer_get_service_description` | Cached service description (JSON `ServiceDescriptionResponse`) |
| `testseer_trigger_index` | Kick off on-demand re-index from GitHub |
| `testseer_get_changed_endpoints` | PR number → GitHub diff → indexed endpoints/classes |
| `testseer_get_pubsub_inventory` | Pub/Sub topics and subscriptions by service/env (Option C) |
| `testseer_trace_topic_flow` | Event flow trace — single service or `crossRepo=true` for org-wide; cross-repo markdown uses `narrative[]` / `hopSummaries[]` when present; includes `consistencyHints` on hops and report root |
| `testseer_get_flow_gates` | Config and business-rule gates per flow step (Option C) |
| `testseer_get_consistency_scenarios` | Cross-store consistency scenarios (dual-write, mirrors, rule pack) |
| `testseer_get_entry_triggers` | Cron, GCS, K8s CronJob, Pub/Sub subscribe entry points |
| `testseer_trace_entry_flow` | Forward trace: trigger → handler → optional Option C + cross-repo + outbound (`includeMessaging`, `crossRepo`, …) |
| `testseer_get_external_endpoints` | Outbound HTTP/gRPC clients indexed per service |
| `testseer_clear_index` | Wipe indexed facts before re-index (`SERVICE`, `MESSAGING`, or `ORG` scope) |
| `testseer_get_service_flow_diagram` | Composed service flow — Mermaid or JSON (BL-054) |
| `testseer_get_maven_dependencies` | Maven module + dependency facts (`GET /v1/facts/maven-dependencies`) |
| `testseer_get_dependency_tree` | Hydrated artifact dependency tree (`GET /v1/graph/dependency-tree`) |

## Example flows

### Local development

1. Developer edits `OrderController.java`
2. Agent calls `testseer_detect_service` → gets `serviceId` + HEAD SHA
3. Agent calls `testseer_get_impact(serviceId, commitSha)`
4. Agent sees `POST /orders` changed, `billing-service` is an upstream caller
5. Agent suggests `OrderControllerTest` (UNIT) and `BillingIntegrationTest` (INTEGRATION)

### PR code review

1. Agent calls `testseer_get_changed_endpoints(orgId, repo, prNumber, serviceId)`
2. Maps changed Java files to indexed endpoints (uses latest index, not PR commit)
3. Agent calls `testseer_get_impact` with PR head SHA for full upstream/downstream analysis

## Known limitations (2026-06-12)

- **`testseer_get_service_description`** — returns cached description JSON from service metadata; **404** when none stored.
- **`testseer_get_changed_endpoints`** — uses the **latest index**, not the PR commit SHA (by design for unindexed PR heads).
- **Error parsing** — backend returns `ApiError` JSON on 4xx/5xx; MCP surfaces `message` and `hint` in tool errors (P16 R2).
- **IntelliJ plugin** — does not use this MCP server; local PSI only.

See also: [CURRENT_STATUS.md](../docs/CURRENT_STATUS.md) (platform repo).

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TESTSEER_URL` | `http://localhost:8080` | TestSeer backend URL |
| `TESTSEER_ORG_ID` | _(none)_ | Default org for cross-repo trace and clear-index (from `config/workspace.yml`) |
| `TESTSEER_TRACE_SHORT_ID` | _(none)_ | Default topic for `testseer_trace_topic_flow` when `crossRepo=true` |
| `TESTSEER_TRACE_ENV` | `pdn` | Default env lane for messaging tools |
| `TESTSEER_MCP_LOG` | `info` | Stderr observability verbosity: `off`, `info`, or `debug` |
| `GITHUB_TOKEN` | _(none)_ | GitHub PAT for `testseer_get_changed_endpoints`. Needs `repo` read scope. |

## Development

```bash
# Watch mode
npm run dev

# Run server directly (stdio MCP)
npm start

# Run automated tool-handler tests (build + node:test)
npm test
```

### Project structure

```
src/
├── index.ts              MCP server entry point (stdio)
├── client.ts             Typed HTTP client; parses ApiError JSON on failures
├── context.ts            serviceId + commitSha auto-detection
└── tools/
    ├── detect.ts         testseer_detect_service
    ├── impact.ts         testseer_get_impact
    ├── gaps.ts           testseer_get_gaps
    ├── services.ts       list, status, description
    ├── index.ts          testseer_trigger_index
    └── changed-endpoints.ts  testseer_get_changed_endpoints
```

## Related projects

- [testseer-backend](https://github.com/snaptestmri/testseer-backend) — indexing platform and REST API this server wraps
