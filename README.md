# TestSeer MCP Server

Exposes TestSeer's impact analysis and gap detection as MCP tools for use in Cursor.

## Setup

1. **Install dependencies**

   ```bash
   npm install && npm run build
   ```

2. **Add to your Java project's `.cursor/mcp.json`**

   Copy from [`cursor-config/mcp.json`](cursor-config/mcp.json) and update paths:

   ```json
   {
     "mcpServers": {
       "testseer": {
         "command": "node",
         "args": ["dist/index.js"],
         "cwd": "/path/to/testseer-mcp",
         "env": {
           "TESTSEER_URL": "http://localhost:8080",
           "GITHUB_TOKEN": "ghp_your_token_here"
         }
       }
     }
   }
   ```

3. **Add `.testseer/config.yml` to your service repo** (optional — enables auto-detection)

   See [`.testseer-config-example.yml`](.testseer-config-example.yml).

## Tools

| Tool | What it does |
|------|-------------|
| `testseer_detect_service` | Auto-detect serviceId from config or git remote |
| `testseer_get_impact` | Impact analysis for a commit — what changed, who calls it, what to test |
| `testseer_get_gaps` | Which production classes have no test class |
| `testseer_list_services` | List all registered services |
| `testseer_get_service_status` | Freshness status — CURRENT / STALE / INDEXING / NOT_INDEXED |
| `testseer_get_service_description` | LLM-generated plain-English service description |
| `testseer_trigger_index` | Kick off an on-demand re-index from GitHub |
| `testseer_get_changed_endpoints` | PR number → GitHub diff → indexed endpoints/classes |

## Example Cursor agent flow

1. Developer edits `OrderController.java`
2. Agent calls `testseer_detect_service` → gets serviceId + HEAD SHA
3. Agent calls `testseer_get_impact(serviceId, headSha)` → sees that `POST /orders` changed
4. Agent sees `cart-service` is an upstream caller
5. Agent generates: `OrderControllerTest` (UNIT) + integration test suggestion for checkout flow
6. Agent offers to write the test code inline

## PR review flow

1. Agent calls `testseer_get_changed_endpoints(orgId, repo, prNumber, serviceId)`
2. Sees which endpoints live in changed files (uses latest index, not PR commit)
3. Agent calls `testseer_get_impact` with PR head SHA for full upstream/downstream analysis

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TESTSEER_URL` | `http://localhost:8080` | TestSeer backend URL |
| `GITHUB_TOKEN` | _(none)_ | GitHub PAT for fetching PR diffs. Required for `testseer_get_changed_endpoints`. Needs `repo` read scope. |
