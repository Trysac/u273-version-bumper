import { describe, expect, it } from "vitest";
import { type CliIo, run } from "../src/cli.js";

function createIo(overrides: Partial<CliIo> = {}): CliIo & {
  stdoutLines: string[];
  stderrLines: string[];
  writes: Map<string, string>;
} {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const writes = new Map<string, string>();
  const files = new Map<string, string>([
    ["packages/a/package.json", '{\n  "name": "a",\n  "version": "1.0.0"\n}'],
    [
      "packages/b/package.json",
      '{\n  "name": "b",\n  "version": "2.1.0",\n  "dependencies": { "a": "^1.0.0" }\n}',
    ],
  ]);
  return {
    stdout: (s: string) => stdoutLines.push(s),
    stderr: (s: string) => stderrLines.push(s),
    readFile: async (p: string) => {
      const content = files.get(p);
      if (content === undefined) throw new Error(`ENOENT: ${p}`);
      return content;
    },
    writeFile: async (p: string, s: string) => {
      writes.set(p, s);
    },
    ...overrides,
    stdoutLines,
    stderrLines,
    writes,
  };
}

describe("run", () => {
  it("prints bumps and returns 0 without writing", async () => {
    const io = createIo();
    const code = await run(
      ["--bump", "a=minor", "packages/a/package.json", "packages/b/package.json"],
      io,
    );
    expect(code).toBe(0);
    expect(io.stdoutLines).toEqual([
      "a 1.0.0 -> 1.1.0 (requested)",
      "b 2.1.0 -> 2.1.1 (dependency)",
    ]);
    expect(io.writes.size).toBe(0);
  });

  it("with --write calls writeFile for each changed file", async () => {
    const io = createIo();
    const code = await run(
      ["--bump", "a=minor", "--write", "packages/a/package.json", "packages/b/package.json"],
      io,
    );
    expect(code).toBe(0);
    expect(io.writes.size).toBe(2);
    expect(io.writes.get("packages/a/package.json")).toContain('"version": "1.1.0"');
    expect(io.writes.get("packages/b/package.json")).toContain('"a": "^1.1.0"');
  });

  it("--json prints the plan as JSON", async () => {
    const io = createIo();
    const code = await run(
      ["--bump", "a=minor", "--json", "packages/a/package.json", "packages/b/package.json"],
      io,
    );
    expect(code).toBe(0);
    const plan = JSON.parse(io.stdoutLines[0] ?? "");
    expect(plan.bumps).toHaveLength(2);
    expect(plan.edits).toHaveLength(1);
  });

  it("returns 2 when --bump is missing", async () => {
    const io = createIo();
    const code = await run(["packages/a/package.json"], io);
    expect(code).toBe(2);
    expect(io.stderrLines[0]).toContain("missing --bump");
  });

  it("returns 1 for unknown package", async () => {
    const io = createIo();
    const code = await run(["--bump", "zzz=minor", "packages/a/package.json"], io);
    expect(code).toBe(1);
    expect(io.stderrLines[0]).toContain("unknown package");
  });

  it("returns 1 for invalid JSON file", async () => {
    const io = createIo({
      readFile: async (p: string) =>
        p === "bad.json" ? "{ invalid" : '{"name":"a","version":"1.0.0"}',
    });
    const code = await run(["--bump", "a=minor", "bad.json"], io);
    expect(code).toBe(1);
    expect(io.stderrLines[0]).toContain("invalid JSON");
  });

  it("returns 2 for unknown option", async () => {
    const io = createIo();
    const code = await run(["--bump", "a=minor", "--nope", "packages/a/package.json"], io);
    expect(code).toBe(2);
    expect(io.stderrLines[0]).toContain("unknown option");
  });

  it("returns 1 for invalid bump level", async () => {
    const io = createIo();
    const code = await run(["--bump", "a=huge", "packages/a/package.json"], io);
    expect(code).toBe(1);
    expect(io.stderrLines[0]).toContain("invalid bump");
  });

  it("returns 2 when no package paths are given", async () => {
    const io = createIo();
    const code = await run(["--bump", "a=minor"], io);
    expect(code).toBe(2);
    expect(io.stderrLines[0]).toContain("missing package.json paths");
  });

  it("returns 1 when a file cannot be read", async () => {
    const io = createIo();
    const code = await run(["--bump", "a=minor", "missing/package.json"], io);
    expect(code).toBe(1);
    expect(io.stderrLines[0]).toContain("cannot read missing/package.json");
  });

  it("returns 1 when a file is not a JSON object", async () => {
    const io = createIo({ readFile: async () => "null" });
    const code = await run(["--bump", "a=minor", "packages/a/package.json"], io);
    expect(code).toBe(1);
    expect(io.stderrLines[0]).toContain("is not an object");
  });

  it("returns 1 when a file misses name or version", async () => {
    const io = createIo({ readFile: async () => '{"name":"a"}' });
    const code = await run(["--bump", "a=minor", "packages/a/package.json"], io);
    expect(code).toBe(1);
    expect(io.stderrLines[0]).toContain("missing name or version");
  });

  it("prints warnings to stderr", async () => {
    const io = createIo({
      readFile: async (p: string) =>
        p === "packages/a/package.json"
          ? '{"name":"a","version":"1.0.0"}'
          : '{"name":"b","version":"2.0.0","peerDependencies":{"a":"^1.0.0"}}',
    });
    const code = await run(
      ["--bump", "a=patch", "packages/a/package.json", "packages/b/package.json"],
      io,
    );
    expect(code).toBe(0);
    expect(io.stderrLines).toContain("warning: b: peer dependency on a not updated");
  });

  it("returns 1 for an unexpected error", async () => {
    const io = createIo({
      stdout: () => {
        throw new Error("boom");
      },
    });
    const code = await run(["--bump", "a=minor", "packages/a/package.json"], io);
    expect(code).toBe(1);
    expect(io.stderrLines[0]).toContain("error: boom");
  });

  it("accepts --bump=name=level and --fixed=a,b forms", async () => {
    const io = createIo({
      readFile: async (p: string) =>
        p === "packages/a/package.json"
          ? '{"name":"a","version":"1.0.0"}'
          : '{"name":"d","version":"1.0.0"}',
    });
    const code = await run(
      ["--bump=a=minor", "--fixed=a,d", "packages/a/package.json", "packages/d/package.json"],
      io,
    );
    expect(code).toBe(0);
    expect(io.stdoutLines).toEqual(["a 1.0.0 -> 1.1.0 (requested)", "d 1.0.0 -> 1.1.0 (group)"]);
  });
});
