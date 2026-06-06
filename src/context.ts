import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export interface ServiceContext {
  serviceId?: string;
  orgId?: string;
  repo?: string;
  commitSha?: string;
}

export function readLocalConfig(cwd = process.cwd()): ServiceContext {
  const configPath = join(cwd, ".testseer", "config.yml");
  if (!existsSync(configPath)) return {};

  const raw = readFileSync(configPath, "utf-8");
  const serviceIdMatch = raw.match(/serviceId:\s*"?([^"\n]+)"?/);
  const orgIdMatch = raw.match(/orgId:\s*"?([^"\n]+)"?/);
  const repoMatch = raw.match(/repo:\s*"?([^"\n]+)"?/);

  return {
    serviceId: serviceIdMatch?.[1]?.trim(),
    orgId: orgIdMatch?.[1]?.trim(),
    repo: repoMatch?.[1]?.trim(),
  };
}

export function gitHeadSha(cwd = process.cwd()): string | undefined {
  try {
    return execSync("git rev-parse HEAD", { cwd, stdio: ["pipe", "pipe", "pipe"] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

export function parseGitRemote(cwd = process.cwd()): { orgId?: string; repo?: string } {
  try {
    const remote = execSync("git remote get-url origin", {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    })
      .toString()
      .trim();
    const match = remote.match(/[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
    if (!match) return {};
    return { orgId: match[1], repo: match[2] };
  } catch {
    return {};
  }
}
