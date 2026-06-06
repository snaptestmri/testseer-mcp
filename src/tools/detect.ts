import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { readLocalConfig, gitHeadSha, parseGitRemote } from "../context.js";
import { findServiceByRepo } from "../client.js";

export const detectTool: Tool = {
  name: "testseer_detect_service",
  description:
    "Auto-detect the TestSeer serviceId for the current project. Reads from .testseer/config.yml if present, " +
    "otherwise resolves from the git remote URL against the service registry. " +
    "Also returns the current git HEAD SHA for use with impact analysis. " +
    "Call this first if you don't know the serviceId.",
  inputSchema: {
    type: "object",
    properties: {
      projectPath: {
        type: "string",
        description: "Absolute path to the project root. Defaults to process.cwd().",
      },
    },
  },
};

export async function handleDetect(args: Record<string, string>) {
  const cwd = args.projectPath ?? process.cwd();
  const config = readLocalConfig(cwd);
  const sha = gitHeadSha(cwd);

  if (config.serviceId) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              serviceId: config.serviceId,
              orgId: config.orgId,
              repo: config.repo,
              commitSha: sha,
              source: "config_file",
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const remote = parseGitRemote(cwd);
  if (remote.orgId && remote.repo) {
    try {
      const svc = await findServiceByRepo(remote.orgId, remote.repo);
      if (svc) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  serviceId: svc.serviceId,
                  orgId: svc.orgId,
                  repo: svc.repo,
                  commitSha: sha,
                  source: "registry_lookup",
                },
                null,
                2
              ),
            },
          ],
        };
      }
    } catch {
      // Registry lookup failed — fall through
    }
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            error:
              "Could not detect service. Run POST /admin/index/local or register via POST /registry/services, then add .testseer/config.yml.",
            detected: { orgId: remote.orgId, repo: remote.repo, commitSha: sha },
          },
          null,
          2
        ),
      },
    ],
    isError: true,
  };
}
