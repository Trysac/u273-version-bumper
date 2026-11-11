import { describe, expect, it } from "vitest";
import {
  applyPlan,
  type BumpPlan,
  bumpVersion,
  type PackageInfo,
  planBumps,
  updateRange,
  VersionBumperError,
} from "../src/index.js";

describe("bumpVersion", () => {
  it("bumps minor and resets patch", () => {
    expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0");
  });

  it("bumps major and resets minor and patch", () => {
    expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
  });

  it("bumps patch without reset", () => {
    expect(bumpVersion("0.9.9", "patch")).toBe("0.9.10");
  });

  it.each([
    ["1.2", "patch"],
    ["1.2.3-beta.1", "patch"],
    ["01.2.3", "patch"],
    ["1.02.3", "patch"],
    ["1.2.03", "patch"],
    ["9007199254740992.0.0", "patch"],
  ])("throws invalid_version for %s with %s", (version, bump) => {
    expect(() => bumpVersion(version, bump as "patch")).toThrowError(
      expect.any(VersionBumperError),
    );
    try {
      bumpVersion(version, bump as "patch");
    } catch (err) {
      expect(err).toBeInstanceOf(VersionBumperError);
      expect((err as VersionBumperError).code).toBe("invalid_version");
    }
  });

  it("throws invalid_bump for unknown level", () => {
    expect(() => bumpVersion("1.2.3", "huge" as never)).toThrowError(
      expect.any(VersionBumperError),
    );
    try {
      bumpVersion("1.2.3", "huge" as never);
    } catch (err) {
      expect(err).toBeInstanceOf(VersionBumperError);
      expect((err as VersionBumperError).code).toBe("invalid_bump");
    }
  });
});

describe("updateRange", () => {
  it("keeps caret operator", () => {
    expect(updateRange("^1.2.0", "1.3.0")).toBe("^1.3.0");
  });

  it("keeps tilde operator", () => {
    expect(updateRange("~1.2.0", "1.3.0")).toBe("~1.3.0");
  });

  it("replaces plain version", () => {
    expect(updateRange("1.2.0", "1.3.0")).toBe("1.3.0");
  });

  it("handles workspace with operator", () => {
    expect(updateRange("workspace:^1.2.0", "1.3.0")).toBe("workspace:^1.3.0");
    expect(updateRange("workspace:~1.2.0", "1.3.0")).toBe("workspace:~1.3.0");
    expect(updateRange("workspace:1.2.0", "1.3.0")).toBe("workspace:1.3.0");
  });

  it.each(["workspace:*", "workspace:^", "workspace:~", "*"])("returns %s unchanged", (range) => {
    expect(updateRange(range, "9.9.9")).toBe(range);
  });

  it("throws unsupported_range for complex range", () => {
    expect(() => updateRange(">=1.0.0 <2.0.0", "1.3.0")).toThrowError(
      expect.any(VersionBumperError),
    );
    try {
      updateRange(">=1.0.0 <2.0.0", "1.3.0");
    } catch (err) {
      expect(err).toBeInstanceOf(VersionBumperError);
      expect((err as VersionBumperError).code).toBe("unsupported_range");
    }
  });
});

describe("planBumps", () => {
  const basePackages: PackageInfo[] = [
    { name: "a", version: "1.0.0" },
    { name: "b", version: "2.1.0", dependencies: { a: "^1.0.0" } },
    { name: "c", version: "0.3.0", devDependencies: { b: "^2.1.0" } },
  ];

  it("propagates patch bumps through dependencies and updates ranges", () => {
    const plan = planBumps(basePackages, { a: "minor" });
    expect(plan.bumps).toEqual([
      { name: "a", from: "1.0.0", to: "1.1.0", reason: "requested" },
      { name: "b", from: "2.1.0", to: "2.1.1", reason: "dependency" },
    ]);
    expect(plan.edits).toEqual([
      { package: "b", field: "dependencies", dependency: "a", from: "^1.0.0", to: "^1.1.0" },
      { package: "c", field: "devDependencies", dependency: "b", from: "^2.1.0", to: "^2.1.1" },
    ]);
    expect(plan.warnings).toEqual([]);
  });

  it("highest requested level wins", () => {
    const pkgs = [
      { name: "a", version: "1.0.0" },
      { name: "b", version: "2.0.0" },
    ];
    const plan = planBumps(pkgs, { a: "patch", b: "major" });
    expect(plan.bumps).toEqual([
      { name: "a", from: "1.0.0", to: "1.0.1", reason: "requested" },
      { name: "b", from: "2.0.0", to: "3.0.0", reason: "requested" },
    ]);
  });

  it("fixed group gives every member the highest level", () => {
    const pkgs = [
      { name: "a", version: "1.0.0" },
      { name: "d", version: "1.0.0" },
    ];
    const plan = planBumps(pkgs, { a: "minor" }, { fixed: [["a", "d"]] });
    expect(plan.bumps).toEqual([
      { name: "a", from: "1.0.0", to: "1.1.0", reason: "requested" },
      { name: "d", from: "1.0.0", to: "1.1.0", reason: "group" },
    ]);
  });

  it("bumps each cyclic package exactly once", () => {
    const pkgs = [
      { name: "a", version: "1.0.0", dependencies: { b: "^1.0.0" } },
      { name: "b", version: "1.0.0", dependencies: { a: "^1.0.0" } },
    ];
    const plan = planBumps(pkgs, { a: "minor" });
    expect(plan.bumps).toHaveLength(2);
    expect(plan.bumps.find((b) => b.name === "a")).toEqual({
      name: "a",
      from: "1.0.0",
      to: "1.1.0",
      reason: "requested",
    });
    expect(plan.bumps.find((b) => b.name === "b")).toEqual({
      name: "b",
      from: "1.0.0",
      to: "1.0.1",
      reason: "dependency",
    });
  });

  it("handles unsupported range with warning and no edit", () => {
    const pkgs = [
      { name: "a", version: "1.0.0" },
      { name: "b", version: "2.0.0", dependencies: { a: ">=1.0.0 <2.0.0" } },
    ];
    const plan = planBumps(pkgs, { a: "minor" });
    expect(plan.edits).toEqual([]);
    expect(plan.warnings).toEqual(["b: unsupported range >=1.0.0 <2.0.0 for a"]);
  });

  it("throws unknown_package for request naming missing package", () => {
    expect(() => planBumps(basePackages, { zzz: "minor" as never })).toThrowError(
      expect.any(VersionBumperError),
    );
    try {
      planBumps(basePackages, { zzz: "minor" as never });
    } catch (err) {
      expect(err).toBeInstanceOf(VersionBumperError);
      expect((err as VersionBumperError).code).toBe("unknown_package");
    }
  });

  it("throws invalid_bump for unknown level", () => {
    expect(() => planBumps(basePackages, { a: "huge" as never })).toThrowError(
      expect.any(VersionBumperError),
    );
    try {
      planBumps(basePackages, { a: "huge" as never });
    } catch (err) {
      expect(err).toBeInstanceOf(VersionBumperError);
      expect((err as VersionBumperError).code).toBe("invalid_bump");
    }
  });

  it("throws duplicate_package for duplicate names", () => {
    expect(() =>
      planBumps([...basePackages, { name: "a", version: "1.0.1" }], { a: "patch" }),
    ).toThrowError(expect.any(VersionBumperError));
    try {
      planBumps([...basePackages, { name: "a", version: "1.0.1" }], { a: "patch" });
    } catch (err) {
      expect(err).toBeInstanceOf(VersionBumperError);
      expect((err as VersionBumperError).code).toBe("duplicate_package");
    }
  });

  it("throws too_many_packages when over 1000", () => {
    const pkgs = Array.from({ length: 1001 }, (_, i) => ({ name: `p${i}`, version: "1.0.0" }));
    expect(() => planBumps(pkgs, { p0: "patch" })).toThrowError(expect.any(VersionBumperError));
    try {
      planBumps(pkgs, { p0: "patch" });
    } catch (err) {
      expect(err).toBeInstanceOf(VersionBumperError);
      expect((err as VersionBumperError).code).toBe("too_many_packages");
    }
  });

  it("reports peerDependencies as warning and does not edit them", () => {
    const pkgs = [
      { name: "a", version: "1.0.0" },
      { name: "b", version: "2.0.0", peerDependencies: { a: "^1.0.0" } },
    ];
    const plan = planBumps(pkgs, { a: "patch" });
    expect(plan.edits).toEqual([]);
    expect(plan.warnings).toEqual(["b: peer dependency on a not updated"]);
  });

  it("edits optionalDependencies and devDependencies without bumping dev-only package", () => {
    const pkgs = [
      { name: "a", version: "1.0.0" },
      { name: "b", version: "2.0.0", optionalDependencies: { a: "~1.0.0" } },
      { name: "c", version: "3.0.0", devDependencies: { a: "workspace:^1.0.0" } },
    ];
    const plan = planBumps(pkgs, { a: "minor" });
    expect(plan.bumps).toEqual([
      { name: "a", from: "1.0.0", to: "1.1.0", reason: "requested" },
      { name: "b", from: "2.0.0", to: "2.0.1", reason: "dependency" },
    ]);
    expect(plan.edits).toEqual([
      {
        package: "b",
        field: "optionalDependencies",
        dependency: "a",
        from: "~1.0.0",
        to: "~1.1.0",
      },
      {
        package: "c",
        field: "devDependencies",
        dependency: "a",
        from: "workspace:^1.0.0",
        to: "workspace:^1.1.0",
      },
    ]);
  });

  it("sorts edits by field and dependency", () => {
    const pkgs = [
      { name: "a", version: "1.0.0" },
      { name: "b", version: "1.0.0" },
      { name: "c", version: "1.0.0" },
      {
        name: "x",
        version: "1.0.0",
        dependencies: { c: "^1.0.0", b: "^1.0.0" },
        devDependencies: { a: "^1.0.0" },
      },
    ];
    const plan = planBumps(pkgs, { a: "patch", b: "patch", c: "patch" });
    expect(plan.edits.map((e) => [e.package, e.field, e.dependency])).toEqual([
      ["x", "dependencies", "b"],
      ["x", "dependencies", "c"],
      ["x", "devDependencies", "a"],
    ]);
  });

  it("sorts output by name", () => {
    const pkgs = [
      { name: "z", version: "1.0.0" },
      { name: "a", version: "1.0.0" },
    ];
    const plan = planBumps(pkgs, { a: "patch", z: "patch" });
    expect(plan.bumps.map((b) => b.name)).toEqual(["a", "z"]);
  });

  it("ignores dependencies on packages outside the workspace", () => {
    const pkgs = [
      { name: "a", version: "1.0.0" },
      { name: "b", version: "1.0.0", dependencies: { react: "^18.0.0" } },
    ];
    const plan = planBumps(pkgs, { a: "minor" });
    expect(plan.bumps).toEqual([{ name: "a", from: "1.0.0", to: "1.1.0", reason: "requested" }]);
    expect(plan.edits).toEqual([]);
    expect(plan.warnings).toEqual([]);
  });

  it("plans 0.x bumps and propagates them", () => {
    const pkgs = [
      { name: "a", version: "0.3.0" },
      { name: "b", version: "0.3.0", dependencies: { a: "^0.3.0" } },
    ];
    const plan = planBumps(pkgs, { a: "minor" });
    expect(plan.bumps).toEqual([
      { name: "a", from: "0.3.0", to: "0.4.0", reason: "requested" },
      { name: "b", from: "0.3.0", to: "0.3.1", reason: "dependency" },
    ]);
    expect(plan.edits).toEqual([
      { package: "b", field: "dependencies", dependency: "a", from: "^0.3.0", to: "^0.4.0" },
    ]);
  });
});

describe("applyPlan", () => {
  it("preserves 4-space indent and trailing newline", () => {
    const plan: BumpPlan = {
      bumps: [{ name: "a", from: "1.0.0", to: "1.1.0", reason: "requested" }],
      edits: [],
      warnings: [],
    };
    const input = '{\n    "name": "a",\n    "version": "1.0.0"\n}\n';
    const files = { "packages/a/package.json": input };
    const result = applyPlan(plan, files);
    expect(result["packages/a/package.json"]).toBe(
      '{\n    "name": "a",\n    "version": "1.1.0"\n}\n',
    );
  });

  it("preserves tab indent", () => {
    const plan: BumpPlan = {
      bumps: [{ name: "a", from: "1.0.0", to: "1.1.0", reason: "requested" }],
      edits: [],
      warnings: [],
    };
    const input = '{\n\t"name": "a",\n\t"version": "1.0.0"\n}';
    const result = applyPlan(plan, { "a/package.json": input });
    expect(result["a/package.json"]).toBe('{\n\t"name": "a",\n\t"version": "1.1.0"\n}');
  });

  it("preserves missing trailing newline", () => {
    const plan: BumpPlan = {
      bumps: [{ name: "a", from: "1.0.0", to: "1.0.1", reason: "patch" as never }],
      edits: [],
      warnings: [],
    };
    const input = '{\n    "name": "a",\n    "version": "1.0.0"\n}';
    const result = applyPlan(plan, { "a/package.json": input });
    expect(result["a/package.json"]).toBe('{\n    "name": "a",\n    "version": "1.0.1"\n}');
  });

  it("updates dependency ranges from edits", () => {
    const plan: BumpPlan = {
      bumps: [{ name: "b", from: "2.1.0", to: "2.1.1", reason: "dependency" }],
      edits: [
        { package: "b", field: "dependencies", dependency: "a", from: "^1.0.0", to: "^1.1.0" },
      ],
      warnings: [],
    };
    const input =
      '{\n  "name": "b",\n  "version": "2.1.0",\n  "dependencies": {\n    "a": "^1.0.0"\n  }\n}';
    const result = applyPlan(plan, { "b/package.json": input });
    expect(result["b/package.json"]).toContain('"dependencies": {\n    "a": "^1.1.0"');
  });

  it("throws invalid_json for unparseable file", () => {
    const plan: BumpPlan = { bumps: [], edits: [], warnings: [] };
    expect(() => applyPlan(plan, { "bad.json": "{ invalid" })).toThrowError(
      expect.any(VersionBumperError),
    );
    try {
      applyPlan(plan, { "bad.json": "{ invalid" });
    } catch (err) {
      expect(err).toBeInstanceOf(VersionBumperError);
      expect((err as VersionBumperError).code).toBe("invalid_json");
    }
  });

  it("keeps single-line files single-line", () => {
    const plan: BumpPlan = {
      bumps: [{ name: "a", from: "1.0.0", to: "1.1.0", reason: "requested" }],
      edits: [],
      warnings: [],
    };
    const input = '{"name":"a","version":"1.0.0"}';
    const result = applyPlan(plan, { "a/package.json": input });
    expect(result["a/package.json"]).toBe('{"name":"a","version":"1.1.0"}');

    const spaced = '{ "name": "a", "version": "1.0.0" }';
    const spacedResult = applyPlan(plan, { "c/package.json": spaced });
    expect(spacedResult["c/package.json"]).not.toContain("\n");
    expect(JSON.parse(spacedResult["c/package.json"] ?? "")).toEqual({
      name: "a",
      version: "1.1.0",
    });
  });

  it("keeps newlines for files whose first key is unindented", () => {
    const plan: BumpPlan = {
      bumps: [{ name: "a", from: "1.0.0", to: "1.1.0", reason: "requested" }],
      edits: [],
      warnings: [],
    };
    const noIndent = '{\n"name":"a",\n"version":"1.0.0"\n}';
    const noIndentResult = applyPlan(plan, { "b/package.json": noIndent });
    expect(noIndentResult["b/package.json"]).toBe('{\n"name": "a",\n"version": "1.1.0"\n}');
  });

  it("skips files that are not package objects", () => {
    const plan: BumpPlan = {
      bumps: [{ name: "a", from: "1.0.0", to: "1.1.0", reason: "requested" }],
      edits: [],
      warnings: [],
    };
    const result = applyPlan(plan, { "list.json": "[]", "null.json": "null" });
    expect(result).toEqual({});
  });

  it("throws invalid_json for oversized files", () => {
    const plan: BumpPlan = { bumps: [], edits: [], warnings: [] };
    try {
      applyPlan(plan, { "big.json": "x".repeat(1_048_577) });
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(VersionBumperError);
      expect((err as VersionBumperError).code).toBe("invalid_json");
    }
  });

  it("returns only changed files", () => {
    const plan: BumpPlan = {
      bumps: [{ name: "a", from: "1.0.0", to: "1.1.0", reason: "requested" }],
      edits: [],
      warnings: [],
    };
    const a = '{\n  "name": "a",\n  "version": "1.0.0"\n}';
    const b = '{\n  "name": "b",\n  "version": "2.0.0"\n}';
    const result = applyPlan(plan, { "a.json": a, "b.json": b });
    expect(Object.keys(result)).toEqual(["a.json"]);
    expect(result["b.json"]).toBeUndefined();
  });
});
