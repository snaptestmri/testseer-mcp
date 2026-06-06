# TestSeer MCP Server

> **Status:** Canonical  
> **Last verified:** 2026-06-05

[MCP](https://modelcontextprotocol.io) server that wraps the [TestSeer backend](https://github.com/snaptestmri/testseer-backend) REST API as tools for Cursor agents. When you're editing a Java service, the agent can call `testseer_get_impact` or `testseer_get_changed_endpoints` and receive structured analysis to generate test suggestions inline.

## Prerequisites

- Node.js 20+
- [TestSeer backend](https://github.com/snaptestmri/testseer-backend) running (default: `http://localhost:8080`)
- GitHub PAT with `repo` read scope (for PR analysis only)

## Setup

### 1. Install and build

```bash
npm install
npm run build
```

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
| `testseer_get_gaps` | Production classes with no test class | **Blocked** — `GET /v1/gaps` not implemented (P12). Use `testseer_get_impact` → `missingTestClasses` for commit-scoped gaps only. |
| `testseer_list_services` | List all registered services |
| `testseer_get_service_status` | Freshness: `CURRENT` / `STALE` / `INDEXING` / `NOT_INDEXED` |
| `testseer_get_service_description` | LLM-generated plain-English service description |
| `testseer_trigger_index` | Kick off on-demand re-index from GitHub |
| `testseer_get_changed_endpoints` | PR number → GitHub diff → indexed endpoints/classes |

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

## Known limitations (2026-06-05)

- **`testseer_get_gaps`** — returns 404 until backend ships `GET /v1/gaps` (see [P12 plan](https://github.com/snaptestmri/testseer-backend/blob/main/docs/archive/plans/2026-06-05-p12-gap-detection.md)).
- **`testseer_get_service_description`** — requires `ANTHROPIC_ENABLED=true` on the backend; otherwise 503.
- **`testseer_get_changed_endpoints`** — uses the **latest index**, not the PR commit SHA (by design for unindexed PR heads).
- **IntelliJ plugin** — does not use this MCP server; local PSI only.

See also: [testseer-backend documentation](https://github.com/snaptestmri/testseer-backend/tree/main/docs).

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TESTSEER_URL` | `http://localhost:8080` | TestSeer backend URL |
| `GITHUB_TOKEN` | _(none)_ | GitHub PAT for `testseer_get_changed_endpoints`. Needs `repo` read scope. |

## Development

```bash
# Watch mode
npm run dev

# Run server directly (stdio MCP)
npm start
```

### Project structure

```
src/
├── index.ts              MCP server entry point (stdio)
├── client.ts             Typed HTTP client for TestSeer REST API
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
