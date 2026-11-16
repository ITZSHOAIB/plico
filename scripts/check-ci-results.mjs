// Keep the merge gate explicit: a later successful check must never hide a matrix failure.
const { REVIEWS_DEPENDENCIES } = process.env;
if (REVIEWS_DEPENDENCIES !== "true" && REVIEWS_DEPENDENCIES !== "false") {
  console.error(
    `REVIEWS_DEPENDENCIES=${REVIEWS_DEPENDENCIES ?? "missing"}: expected true or false`,
  );
  process.exitCode = 1;
} else {
  const expected = {
    VALIDATE: "success",
    SMOKE: "success",
    DEPENDENCIES: REVIEWS_DEPENDENCIES === "true" ? "success" : "skipped",
  };
  for (const [job, result] of Object.entries(expected)) {
    if (process.env[job] !== result) {
      console.error(`${job}=${process.env[job] ?? "missing"}: expected ${result}`);
      process.exitCode = 1;
    }
  }
}
