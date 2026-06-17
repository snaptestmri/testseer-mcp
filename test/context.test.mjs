import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

describe("context helpers", () => {
  let tmpDir;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "testseer-context-"));
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("readLocalConfig parses .testseer/config.yml", async () => {
    const project = join(tmpDir, "with-config");
    mkdirSync(join(project, ".testseer"), { recursive: true });
    writeFileSync(
      join(project, ".testseer", "config.yml"),
      'serviceId: "svc-orders"\norgId: acme\nrepo: orders\n'
    );

    const { readLocalConfig } = await import("../dist/context.js");
    const config = readLocalConfig(project);
    assert.equal(config.serviceId, "svc-orders");
    assert.equal(config.orgId, "acme");
    assert.equal(config.repo, "orders");
  });

  it("readLocalConfig returns empty object when config missing", async () => {
    const project = join(tmpDir, "no-config");
    mkdirSync(project, { recursive: true });

    const { readLocalConfig } = await import("../dist/context.js");
    assert.deepEqual(readLocalConfig(project), {});
  });

  it("parseGitRemote extracts org and repo from origin URL", async () => {
    const project = join(tmpDir, "git-repo");
    mkdirSync(project, { recursive: true });
    execSync("git init", { cwd: project, stdio: "pipe" });
    execSync("git remote add origin git@github.com:quotient/platform-orders.git", {
      cwd: project,
      stdio: "pipe",
    });

    const { parseGitRemote } = await import("../dist/context.js");
    assert.deepEqual(parseGitRemote(project), {
      orgId: "quotient",
      repo: "platform-orders",
    });
  });

  it("gitHeadSha returns undefined outside a git repo", async () => {
    const project = join(tmpDir, "not-git");
    mkdirSync(project, { recursive: true });

    const { gitHeadSha } = await import("../dist/context.js");
    assert.equal(gitHeadSha(project), undefined);
  });
});
