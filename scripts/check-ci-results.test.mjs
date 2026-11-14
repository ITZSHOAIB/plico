import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const script = fileURLToPath(new URL("./check-ci-results.mjs", import.meta.url));
const passing = { VALIDATE: "success", SMOKE: "success", DEPENDENCIES: "success", IS_PR: "true" };

it("rejects a matrix failure even when dependency review passes", () => {
  const result = spawnSync(process.execPath, [script], {
    env: { ...process.env, ...passing, VALIDATE: "failure" },
    encoding: "utf8",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("VALIDATE=failure");
});

it.each([
  ["VALIDATE", "skipped"],
  ["VALIDATE", "cancelled"],
  ["VALIDATE", ""],
  ["SMOKE", "failure"],
  ["SMOKE", "skipped"],
  ["SMOKE", "cancelled"],
  ["DEPENDENCIES", "failure"],
  ["DEPENDENCIES", "skipped"],
  ["DEPENDENCIES", "cancelled"],
  ["IS_PR", ""],
])("rejects %s=%s rather than silently passing", (job, state) => {
  const result = spawnSync(process.execPath, [script], {
    env: { ...process.env, ...passing, [job]: state },
    encoding: "utf8",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(`${job}=`);
});

it.each([
  passing,
  { ...passing, IS_PR: "false", DEPENDENCIES: "skipped" },
])("accepts successful PR or main checks", (results) => {
  const result = spawnSync(process.execPath, [script], {
    env: { ...process.env, ...results },
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
});
