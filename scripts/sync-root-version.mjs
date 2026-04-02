import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const rootPackagePath = path.join(repoRoot, "package.json");
const workspacePackagePaths = [
  "packages/cli/package.json",
  "packages/shared/package.json",
  "packages/solver/package.json",
  "packages/plugins/hosts/codex/package.json",
  "packages/plugins/hosts/claude-code/package.json",
  "packages/plugins/hosts/cursor/package.json",
  "packages/plugins/runtime/opencode/package.json",
  "packages/plugins/runtime/openclaw/package.json",
].map((relativePath) => path.join(repoRoot, relativePath));

const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, "utf8"));
const workspaceVersions = [
  ...new Set(
    workspacePackagePaths.map((packagePath) => {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
      return packageJson.version;
    }),
  ),
];

if (workspaceVersions.length !== 1) {
  throw new Error(
    `Expected one workspace version, found: ${workspaceVersions.join(", ")}`,
  );
}

const [nextVersion] = workspaceVersions;

if (rootPackage.version === nextVersion) {
  console.log(`Root version already aligned at ${nextVersion}`);
  process.exit(0);
}

rootPackage.version = nextVersion;
fs.writeFileSync(rootPackagePath, `${JSON.stringify(rootPackage, null, 2)}\n`);

console.log(`Updated root package version to ${nextVersion}`);
