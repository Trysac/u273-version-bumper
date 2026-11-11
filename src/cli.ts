import { applyPlan, type Bump, type PackageInfo, planBumps, VersionBumperError } from "./index.js";

/** I/O interface required by `run`, keeping the CLI independent of Node APIs. */
export interface CliIo {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  readFile: (p: string) => Promise<string>;
  writeFile: (p: string, s: string) => Promise<void>;
}

class UsageError extends Error {}

interface ParsedArgs {
  packages: string[];
  requests: Record<string, Bump>;
  fixed: string[][];
  write: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const packages: string[] = [];
  const requests: Record<string, Bump> = {};
  const fixed: string[][] = [];
  let write = false;
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--write") {
      write = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--bump") {
      const value = argv[i + 1];
      if (value === undefined) throw new UsageError("--bump requires a value");
      i++;
      const eq = value.indexOf("=");
      if (eq === -1) throw new UsageError(`--bump value must be name=level, got ${value}`);
      const name = value.slice(0, eq);
      const level = value.slice(eq + 1);
      if (!["major", "minor", "patch"].includes(level)) {
        throw new VersionBumperError("invalid_bump", `invalid bump: ${level}`);
      }
      requests[name] = level as Bump;
      continue;
    }
    if (arg.startsWith("--bump=")) {
      const value = arg.slice("--bump=".length);
      const eq = value.indexOf("=");
      if (eq === -1) throw new UsageError(`--bump value must be name=level, got ${value}`);
      const name = value.slice(0, eq);
      const level = value.slice(eq + 1);
      if (!["major", "minor", "patch"].includes(level)) {
        throw new VersionBumperError("invalid_bump", `invalid bump: ${level}`);
      }
      requests[name] = level as Bump;
      continue;
    }
    if (arg === "--fixed") {
      const value = argv[i + 1];
      if (value === undefined) throw new UsageError("--fixed requires a value");
      i++;
      fixed.push(value.split(",").filter((s) => s.length > 0));
      continue;
    }
    if (arg.startsWith("--fixed=")) {
      fixed.push(
        arg
          .slice("--fixed=".length)
          .split(",")
          .filter((s) => s.length > 0),
      );
      continue;
    }
    if (arg.startsWith("--")) {
      throw new UsageError(`unknown option: ${arg}`);
    }
    packages.push(arg);
  }

  return { packages, requests, fixed, write, json };
}

/**
 * Runs the command-line interface.
 *
 * Positional arguments are package.json paths. Repeated `--bump name=level`
 * requests bumps, `--fixed a,b` defines a fixed group, `--write` writes the
 * changed files back, and `--json` prints the plan as JSON.
 *
 * @param argv - Command-line arguments without the executable and script name.
 * @param io - I/O interface used for all output and file access.
 * @returns Exit code: 0 on success, 1 on domain error, 2 on usage error.
 */
export async function run(argv: string[], io: CliIo): Promise<number> {
  try {
    const parsed = parseArgs(argv);
    if (Object.keys(parsed.requests).length === 0) {
      throw new UsageError("missing --bump");
    }
    if (parsed.packages.length === 0) {
      throw new UsageError("missing package.json paths");
    }

    const files: Record<string, string> = {};
    for (const path of parsed.packages) {
      try {
        files[path] = await io.readFile(path);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new VersionBumperError("invalid_json", `cannot read ${path}: ${message}`);
      }
    }

    const packages: PackageInfo[] = [];
    for (const path of parsed.packages) {
      let json: unknown;
      try {
        json = JSON.parse(files[path] ?? "");
      } catch {
        throw new VersionBumperError("invalid_json", `invalid JSON in ${path}`);
      }
      if (typeof json !== "object" || json === null) {
        throw new VersionBumperError("invalid_json", `package file ${path} is not an object`);
      }
      const record = json as { name?: unknown; version?: unknown; [key: string]: unknown };
      if (typeof record.name !== "string" || typeof record.version !== "string") {
        throw new VersionBumperError(
          "invalid_json",
          `package file ${path} missing name or version`,
        );
      }
      packages.push({
        name: record.name,
        version: record.version,
        ...("dependencies" in record &&
        typeof record.dependencies === "object" &&
        record.dependencies !== null
          ? { dependencies: record.dependencies as Record<string, string> }
          : {}),
        ...("devDependencies" in record &&
        typeof record.devDependencies === "object" &&
        record.devDependencies !== null
          ? { devDependencies: record.devDependencies as Record<string, string> }
          : {}),
        ...("optionalDependencies" in record &&
        typeof record.optionalDependencies === "object" &&
        record.optionalDependencies !== null
          ? { optionalDependencies: record.optionalDependencies as Record<string, string> }
          : {}),
        ...("peerDependencies" in record &&
        typeof record.peerDependencies === "object" &&
        record.peerDependencies !== null
          ? { peerDependencies: record.peerDependencies as Record<string, string> }
          : {}),
      });
    }

    const plan = planBumps(packages, parsed.requests, { fixed: parsed.fixed });

    if (parsed.json) {
      io.stdout(JSON.stringify(plan));
    } else {
      for (const bump of plan.bumps) {
        io.stdout(`${bump.name} ${bump.from} -> ${bump.to} (${bump.reason})`);
      }
      for (const warning of plan.warnings) {
        io.stderr(`warning: ${warning}`);
      }
    }

    if (parsed.write && plan.bumps.length > 0) {
      const changed = applyPlan(plan, files);
      for (const [path, content] of Object.entries(changed)) {
        await io.writeFile(path, content);
      }
    }

    return 0;
  } catch (err) {
    if (err instanceof UsageError) {
      io.stderr(err.message);
      return 2;
    }
    if (err instanceof VersionBumperError) {
      io.stderr(`error: ${err.message}`);
      return 1;
    }
    const message = err instanceof Error ? err.message : String(err);
    io.stderr(`error: ${message}`);
    return 1;
  }
}
