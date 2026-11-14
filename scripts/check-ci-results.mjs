// Keep the merge gate explicit: a later successful check must never hide a matrix failure.
const { IS_PR } = process.env;
if (IS_PR !== "true" && IS_PR !== "false") {
  console.error(`IS_PR=${IS_PR ?? "missing"}: expected true or false`);
  process.exitCode = 1;
} else {
  const expected = {
    VALIDATE: "success",
    SMOKE: "success",
    DEPENDENCIES: IS_PR === "true" ? "success" : "skipped",
  };
  for (const [job, result] of Object.entries(expected)) {
    if (process.env[job] !== result) {
      console.error(`${job}=${process.env[job] ?? "missing"}: expected ${result}`);
      process.exitCode = 1;
    }
  }
}
