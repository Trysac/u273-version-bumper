/**
 * Public API of @trysac/version-bumper.
 *
 * A pure planner and applier for coordinated version bumps across a JavaScript
 * workspace. It computes version bumps from explicit requests, propagates patch
 * bumps through dependencies, updates internal dependency ranges, and applies
 * the plan to package.json texts without disturbing their formatting.
 */

/** Allowed bump levels, in increasing order of impact. */
export type Bump = "major" | "minor" | "patch";

/** Reason a package was bumped. */
export type BumpReason = "requested" | "dependency" | "group";

/** A package manifest as needed by the planner. */
export interface PackageInfo {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/** A single version bump record. */
export interface BumpRecord {
  name: string;
  from: string;
  to: string;
  reason: BumpReason;
}

/** A single dependency range edit. */
export interface RangeEdit {
  package: string;
  field: "dependencies" | "devDependencies" | "optionalDependencies";
  dependency: string;
  from: string;
  to: string;
}

/** The result of planning a set of bumps. */
export interface BumpPlan {
  bumps: BumpRecord[];
  edits: RangeEdit[];
  warnings: string[];
}

/** Machine-readable error codes. */
export type VersionBumperErrorCode =
  | "invalid_version"
  | "invalid_bump"
  | "unknown_package"
  | "unsupported_range"
  | "duplicate_package"
  | "invalid_json"
  | "too_many_packages";

/**
 * Base error class for @trysac/version-bumper. Every error carries a stable
 * machine-readable `code`.
 */
export class VersionBumperError extends Error {
  readonly code: VersionBumperErrorCode;

  constructor(code: VersionBumperErrorCode, message?: string) {
    super(message ?? code);
    this.name = "VersionBumperError";
    this.code = code;
  }
}

const BUMP_LEVELS: readonly Bump[] = ["major", "minor", "patch"] as const;
const LEVEL_RANK: Record<Bump, number> = { major: 2, minor: 1, patch: 0 };

function truncateForError(input: string): string {
  return input.length > 200 ? `${input.slice(0, 197)}...` : input;
}

function parseVersion(version: string): { major: number; minor: number; patch: number } {
  if (typeof version !== "string") {
    throw new VersionBumperError(
      "invalid_version",
      `invalid version: ${truncateForError(String(version))}`,
    );
  }
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new VersionBumperError(
      "invalid_version",
      `invalid version: ${truncateForError(version)}`,
    );
  }
  const majorPart = match[1];
  const minorPart = match[2];
  const patchPart = match[3];
  if (majorPart === undefined || minorPart === undefined || patchPart === undefined) {
    throw new VersionBumperError(
      "invalid_version",
      `invalid version: ${truncateForError(version)}`,
    );
  }
  const parts = [majorPart, minorPart, patchPart];
  for (const part of parts) {
    if (part.length > 1 && part.startsWith("0")) {
      throw new VersionBumperError(
        "invalid_version",
        `invalid version: ${truncateForError(version)}`,
      );
    }
    const num = Number(part);
    if (!Number.isSafeInteger(num)) {
      throw new VersionBumperError(
        "invalid_version",
        `invalid version: ${truncateForError(version)}`,
      );
    }
  }
  return { major: Number(majorPart), minor: Number(minorPart), patch: Number(patchPart) };
}

function isBump(value: string): value is Bump {
  return BUMP_LEVELS.includes(value as Bump);
}

/**
 * Bumps a strict MAJOR.MINOR.PATCH version (SemVer 2.0.0 section 2, no
 * prerelease or build metadata). Lower parts are reset according to SemVer
 * items 6-8.
 *
 * @param version - The version to bump. Must be strict MAJOR.MINOR.PATCH with
 *   non-negative integer parts no greater than 2**53 - 1 and no leading zeros.
 * @param bump - The level to bump.
 * @returns The bumped version.
 * @throws {VersionBumperError} With code `invalid_version` when `version` is
 *   not a valid strict version, or code `invalid_bump` when `bump` is not one
 *   of `major`, `minor`, `patch`.
 */
export function bumpVersion(version: string, bump: Bump): string {
  if (!isBump(bump)) {
    throw new VersionBumperError("invalid_bump", `invalid bump: ${truncateForError(String(bump))}`);
  }
  const parsed = parseVersion(version);
  switch (bump) {
    case "major":
      return `${parsed.major + 1}.0.0`;
    case "minor":
      return `${parsed.major}.${parsed.minor + 1}.0`;
    case "patch":
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  }
}

function isStrictVersion(value: string): boolean {
  try {
    parseVersion(value);
    return true;
  } catch {
    return false;
  }
}

function replaceVersionPart(rest: string, newVersion: string): string {
  if (rest.startsWith("^") || rest.startsWith("~")) {
    const oldVersion = rest.slice(1);
    if (!isStrictVersion(oldVersion)) {
      throw new VersionBumperError(
        "unsupported_range",
        `unsupported range: ${truncateForError(rest)}`,
      );
    }
    return rest[0] + newVersion;
  }
  if (isStrictVersion(rest)) {
    return newVersion;
  }
  throw new VersionBumperError("unsupported_range", `unsupported range: ${truncateForError(rest)}`);
}

/**
 * Updates a dependency range to point at `newVersion`, preserving its
 * operator.
 *
 * Supported operators are `^`, `~`, none, and `workspace:` followed by one of
 * those. `workspace:*`, `workspace:^`, `workspace:~` and `*` are returned
 * unchanged. Any other range throws `unsupported_range`.
 *
 * @param range - The current range.
 * @param newVersion - The new strict version to embed.
 * @returns The updated range.
 * @throws {VersionBumperError} With code `unsupported_range` for unsupported
 *   ranges, or code `invalid_version` when `newVersion` is invalid.
 */
export function updateRange(range: string, newVersion: string): string {
  parseVersion(newVersion); // validate target
  if (
    range === "*" ||
    range === "workspace:*" ||
    range === "workspace:^" ||
    range === "workspace:~"
  ) {
    return range;
  }
  if (range.startsWith("workspace:")) {
    const rest = range.slice("workspace:".length);
    return `workspace:${replaceVersionPart(rest, newVersion)}`;
  }
  return replaceVersionPart(range, newVersion);
}

/**
 * Plans coordinated version bumps across a workspace.
 *
 * The plan is a fixed point over major > minor > patch. Requested bumps are
 * applied first. Every package whose `dependencies` or `optionalDependencies`
 * reference a bumped workspace package receives at least a patch bump
 * (reason `dependency`). `devDependencies` ranges are updated without bumping
 * their owning package. `peerDependencies` are left alone and reported as a
 * warning. Fixed groups force every member to the highest level in the group
 * (reason `group`). Reason priority on ties is requested > group > dependency.
 *
 * Limits: at most 1000 packages. Duplicate names, unknown packages and invalid
 * bumps throw typed errors.
 *
 * @param packages - Workspace manifests.
 * @param requests - Map of package name to requested bump level.
 * @param opts - Optional fixed groups `{ fixed?: string[][] }`.
 * @returns The plan with `bumps`, `edits` and `warnings` sorted by name
 *   (edits by package, field, dependency).
 * @throws {VersionBumperError} With codes `too_many_packages`,
 *   `duplicate_package`, `invalid_version`, `invalid_bump` or
 *   `unknown_package`.
 */
export function planBumps(
  packages: PackageInfo[],
  requests: Record<string, Bump>,
  opts: { fixed?: string[][] } = {},
): BumpPlan {
  if (packages.length > 1000) {
    throw new VersionBumperError("too_many_packages");
  }

  const packageByName = new Map<string, PackageInfo>();
  for (const pkg of packages) {
    if (packageByName.has(pkg.name)) {
      throw new VersionBumperError(
        "duplicate_package",
        `duplicate package: ${truncateForError(pkg.name)}`,
      );
    }
    packageByName.set(pkg.name, pkg);
    parseVersion(pkg.version);
  }

  for (const [name, bump] of Object.entries(requests)) {
    if (!isBump(bump)) {
      throw new VersionBumperError(
        "invalid_bump",
        `invalid bump: ${truncateForError(String(bump))}`,
      );
    }
    if (!packageByName.has(name)) {
      throw new VersionBumperError("unknown_package", `unknown package: ${truncateForError(name)}`);
    }
  }

  const fixed = opts.fixed ?? [];
  for (const group of fixed) {
    for (const name of group) {
      if (!packageByName.has(name)) {
        throw new VersionBumperError(
          "unknown_package",
          `unknown package: ${truncateForError(name)}`,
        );
      }
    }
  }

  const levels = new Map<string, Bump>();
  const reasons = new Map<string, BumpReason>();

  // Requested bumps first.
  for (const [name, bump] of Object.entries(requests)) {
    levels.set(name, bump);
    reasons.set(name, "requested");
  }

  // Fixed point over group and dependency propagation.
  let changed = true;
  while (changed) {
    changed = false;

    // Group propagation: each group forces the highest level among members.
    for (const group of fixed) {
      let maxLevel: Bump | undefined;
      for (const name of group) {
        const level = levels.get(name);
        if (level && (maxLevel === undefined || LEVEL_RANK[level] > LEVEL_RANK[maxLevel])) {
          maxLevel = level;
        }
      }
      if (maxLevel === undefined) continue;
      for (const name of group) {
        const current = levels.get(name);
        const currentReason = reasons.get(name);
        if (
          current === undefined ||
          LEVEL_RANK[maxLevel] > LEVEL_RANK[current] ||
          (LEVEL_RANK[maxLevel] === LEVEL_RANK[current] &&
            currentReason !== "requested" &&
            currentReason !== "group")
        ) {
          levels.set(name, maxLevel);
          reasons.set(name, "group");
          changed = true;
        }
      }
    }

    // Dependency propagation: dependencies and optionalDependencies on a bumped
    // workspace package cause at least a patch bump.
    for (const pkg of packages) {
      const depFields = [pkg.dependencies, pkg.optionalDependencies];
      for (const field of depFields) {
        if (!field) continue;
        for (const depName of Object.keys(field)) {
          if (!levels.has(depName)) continue;
          const current = levels.get(pkg.name);
          const currentReason = reasons.get(pkg.name);
          if (
            current === undefined ||
            LEVEL_RANK.patch > LEVEL_RANK[current] ||
            (LEVEL_RANK.patch === LEVEL_RANK[current] &&
              currentReason !== "requested" &&
              currentReason !== "group" &&
              currentReason !== "dependency")
          ) {
            levels.set(pkg.name, "patch");
            reasons.set(pkg.name, "dependency");
            changed = true;
          }
        }
      }
    }
  }

  // Compute bumped versions.
  const bumpedVersions = new Map<string, string>();
  for (const [name, level] of levels) {
    const pkg = packageByName.get(name);
    if (pkg) {
      bumpedVersions.set(name, bumpVersion(pkg.version, level));
    }
  }

  const bumps: BumpRecord[] = [];
  for (const pkg of packages) {
    const level = levels.get(pkg.name);
    const to = bumpedVersions.get(pkg.name);
    const reason = reasons.get(pkg.name);
    if (level && to !== undefined && reason !== undefined) {
      bumps.push({
        name: pkg.name,
        from: pkg.version,
        to,
        reason,
      });
    }
  }
  bumps.sort((a, b) => a.name.localeCompare(b.name));

  const edits: RangeEdit[] = [];
  const warnings: string[] = [];

  const editableFields = ["dependencies", "optionalDependencies", "devDependencies"] as const;
  for (const pkg of packages) {
    for (const field of editableFields) {
      const deps = pkg[field];
      if (!deps) continue;
      for (const [depName, range] of Object.entries(deps)) {
        if (!levels.has(depName)) continue;
        const newVersion = bumpedVersions.get(depName);
        if (newVersion === undefined) continue;
        try {
          const updated = updateRange(range, newVersion);
          edits.push({
            package: pkg.name,
            field,
            dependency: depName,
            from: range,
            to: updated,
          });
        } catch (err) {
          if (err instanceof VersionBumperError && err.code === "unsupported_range") {
            warnings.push(`${pkg.name}: unsupported range ${range} for ${depName}`);
          } else {
            throw err;
          }
        }
      }
    }
    const peerDeps = pkg.peerDependencies;
    if (peerDeps) {
      for (const depName of Object.keys(peerDeps)) {
        if (levels.has(depName)) {
          warnings.push(`${pkg.name}: peer dependency on ${depName} not updated`);
        }
      }
    }
  }

  edits.sort((a, b) => {
    if (a.package !== b.package) return a.package.localeCompare(b.package);
    if (a.field !== b.field) return a.field.localeCompare(b.field);
    return a.dependency.localeCompare(b.dependency);
  });
  warnings.sort();

  return { bumps, edits, warnings };
}

/**
 * Detects the indentation of a JSON object literal.
 *
 * @returns `null` when the first key shares the opening brace (a single-line
 *   file, which must stay single-line), otherwise the whitespace after the last
 *   newline before the first key (possibly the empty string).
 */
function getIndent(original: string): string | null {
  const match = /^\{([ \t\r\n]*)[^\s]/.exec(original);
  if (!match) return null;
  const whitespace = match[1] ?? "";
  const lastNewline = Math.max(whitespace.lastIndexOf("\n"), whitespace.lastIndexOf("\r"));
  if (lastNewline === -1) return null;
  return whitespace.slice(lastNewline + 1);
}

function serializePackage(obj: unknown, original: string): string {
  const indent = getIndent(original);
  let serialized: string;
  if (indent === null) {
    serialized = JSON.stringify(obj);
  } else if (indent === "") {
    // Empty indentation still needs newlines; a NUL placeholder keeps them
    // without adding leading whitespace, then is stripped.
    serialized = JSON.stringify(obj, null, "\u0000").replaceAll("\u0000", "");
  } else {
    serialized = JSON.stringify(obj, null, indent);
  }
  return original.endsWith("\n") ? `${serialized}\n` : serialized;
}

/**
 * Applies a plan to a set of package.json file contents.
 *
 * Each file is matched to a package by its `name` field. The version and the
 * edited dependency ranges are updated, and the file is re-serialised with the
 * detected indentation (whitespace before the first key) and the original
 * trailing newline. Key order is preserved.
 *
 * Limits: each file must be at most 1_048_576 characters. Invalid JSON throws
 * `invalid_json`.
 *
 * @param plan - The plan returned by `planBumps`.
 * @param files - Map of path to file content.
 * @returns Only the files whose content changed.
 * @throws {VersionBumperError} With code `invalid_json` when a file cannot be
 *   parsed or exceeds the size limit.
 */
export function applyPlan(plan: BumpPlan, files: Record<string, string>): Record<string, string> {
  const bumpByPackage = new Map(plan.bumps.map((b) => [b.name, b]));
  const editsByPackage = new Map<string, Map<RangeEdit["field"], RangeEdit[]>>();
  for (const edit of plan.edits) {
    let byPackage = editsByPackage.get(edit.package);
    if (!byPackage) {
      byPackage = new Map();
      editsByPackage.set(edit.package, byPackage);
    }
    let list = byPackage.get(edit.field);
    if (!list) {
      list = [];
      byPackage.set(edit.field, list);
    }
    list.push(edit);
  }

  const result: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if (content.length > 1_048_576) {
      throw new VersionBumperError("invalid_json", `file too large: ${truncateForError(path)}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new VersionBumperError("invalid_json", `invalid JSON in ${truncateForError(path)}`);
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { name?: unknown }).name !== "string"
    ) {
      continue;
    }
    const pkg = parsed as {
      name: string;
      version?: string;
      [key: string]: unknown;
    };
    let changed = false;

    const bump = bumpByPackage.get(pkg.name);
    if (bump && pkg.version !== bump.to) {
      pkg.version = bump.to;
      changed = true;
    }

    const pkgEdits = editsByPackage.get(pkg.name);
    if (pkgEdits) {
      for (const [field, editList] of pkgEdits) {
        const depObj = pkg[field];
        if (depObj && typeof depObj === "object") {
          const record = depObj as Record<string, unknown>;
          for (const edit of editList) {
            if (record[edit.dependency] !== edit.to) {
              record[edit.dependency] = edit.to;
              changed = true;
            }
          }
        }
      }
    }

    if (changed) {
      const serialized = serializePackage(pkg, content);
      if (serialized !== content) {
        result[path] = serialized;
      }
    }
  }
  return result;
}
