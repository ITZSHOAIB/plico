# Kitesurf as a Plico harness capability

**Date:** 2026-11-14  
**Status:** Proposed recommendation; no implementation or roadmap change authorized by this audit.  
**Baseline:** Plico `e67e4e9`; live GitHub epic #77 and first-party sources reviewed on this date. Source inspection and desk research only: no browser workload, credentials, deployment, or billing experiment was run.

## Recommendation

**Do not bundle Kitesurf into the core harness or make it a default dependency. Keep it as a candidate for an opt-in rendered-web-reading example, promoted only after a workload-specific experiment.**

The useful capability is reading a page that needs JavaScript. Kitesurf is one possible engine behind that capability. Plico should retain the tool definition, approval decision, recorded result, artifacts, and evals; the application or external service should own browser infrastructure.

This is a qualified yes to integration, a no to a built-in browser product, and a defer on general browser automation. It does not require a new package, public browser contract, config key, or canonical browser events today.

## What the evidence supports

- **Useful but immature.** Cloudflare labels the managed engine beta and currently free under account limits. It offers Quick Actions and CDP, with documented Puppeteer/Playwright connections. Missing capabilities include video, WebGL, real TLS fingerprints for bot challenges, and persistent authenticated workloads. Rendering is not pixel-perfect. These are material constraints for internal-ops applications that depend on signed-in SaaS. [Kitesurf documentation](https://developers.cloudflare.com/browser-run/kitesurf/)
- **Efficiency is plausible; speed and savings need measurement.** The current first-party benchmark covers 38 pages with five runs each. Screenshot medians: 361 ms CPU and 54 MiB for Kitesurf versus 1.33 s and 389 MiB for Browser Run Chromium; wall time is 1.20 s versus 820 ms. This is a vendor corpus, not a Plico task-completion benchmark. The docs' older 14-URL summary differs; do not combine the two datasets. [Benchmark dashboard](https://kitesurf.dev/benchmarks)
- **A standards percentage is not site reliability.** The November 13 WPT dashboard reports 98.3% passing subtests when skipped tests are excluded, but 56,854 files are skipped. Encoding alone contributes over 1.1 million passing subtests. That aggregate cannot establish compatibility with a target SaaS workflow. [WPT dashboard](https://kitesurf.dev/wpt)
- **Open source does not make bundling cheap.** The Apache-2.0 repository documents a local `wrangler dev` engine, built through Bazel and Rust/Wasm. Deploying the engine on Cloudflare uses paid Dynamic Workers. Its deployment instructions require authentication because the engine supplies none itself. Pin investigated source to [`4a29038`](https://github.com/cloudflare/kitesurf/tree/4a2903813a22b08d4f3cc64a4b35339d0293a5d1). [Source README](https://github.com/cloudflare/kitesurf/blob/4a2903813a22b08d4f3cc64a4b35339d0293a5d1/README.md)

The managed browser binding requires remote mode in local development. That is distinct from building the open-source engine locally; neither path was exercised here. [Managed integration docs](https://developers.cloudflare.com/browser-run/kitesurf/)

Cloudflare describes recovery that can substitute empty output for failing elements. A successful response therefore needs content-completeness checks. Also, Browser Run's documented hostname guardrails are session-only, unavailable for Quick Actions; their Kitesurf-specific enforcement was not established in this review. [Engineering announcement](https://blog.cloudflare.com/kitesurf/), [Guardrails documentation](https://developers.cloudflare.com/browser-run/features/guardrails/)

The general Browser Run pricing page bills browser time and, for sessions, concurrency. CPU reductions therefore do not directly prove proportional bill reductions. Kitesurf's free beta is not a durable price commitment; fallback Chromium and a self-deployed engine have different cost models. [Browser Run pricing](https://developers.cloudflare.com/browser-run/pricing/), [Kitesurf beta pricing](https://developers.cloudflare.com/browser-run/kitesurf/)

## Fit with Plico today

The [PRD](../prds/plico-agent-app-kit-prd.md) explicitly excludes building browser automation or computer use as a complete product area, except for a narrow prototype. An optional application tool respects that boundary and the local-first project contract: ordinary Plico use must not need Cloudflare credentials or a remote browser.

The current [tool contract](../../packages/contracts/src/tools.ts) already provides schema-validated input, capability labels, approvals, cancellation signal, idempotency key, and artifact writes. A `.tool.ts` handler can call a managed HTTP endpoint without MCP or a browser framework dependency. [Tool documentation](../../packages/docs/content/docs/tools.mdx)

Important limits in that existing surface:

- `capabilities` are recorded labels, **not enforced permissions**. A `web:read` label cannot restrict navigation, subresources, or scripts.
- A single approved tool call can contain many browser actions. Plico cannot inspect or approve every click hidden inside an opaque handler.
- [Tool execution](../../packages/runtime/src/run/tool-step.ts) journals completed results, but an unfinished remote operation may execute again after a crash. A browser session identifier does not provide durable state or exactly-once writes. See [ADR 0008](../adrs/0008-execution-engine-interface.md) for the execution model.
- [Artifact writes](../../packages/runtime/src/run/artifact-tool-context.ts) currently cap each content value at 1 MiB. Screenshots, PDFs, and HTML need measured limits rather than an assumption that every output fits.
- Handler output goes into the recorded result. Do not return raw CDP objects, credentials, cookies, signed URLs, or unbounded HTML.

[Epic #77](https://github.com/ITZSHOAIB/plico/issues/77) remains open with MCP slices unchecked. It requires normalization, central approvals, readiness, Studio inspection, and treatment of tool output as untrusted content. Once shipped, that is another integration path through `chrome-devtools-mcp`; it is not a reason to accelerate MCP solely for Kitesurf. Remote auth flows remain outside that epic's default scope.

## Smallest useful experiment

Propose one project-local `read_web_page` tool with a fixed engine selected by application configuration. Accept a URL and bounded extraction options; return final URL, retrieval time, bounded text, truncation status, and engine identity. Keep this an example-local result shape, not a shared wire contract. Add screenshot/PDF output only if the pilot actually needs it.

Start with plain HTTP extraction for simple pages and compare Kitesurf against Chromium for JavaScript-dependent pages. Kitesurf does not supply search discovery, ranking, or citations by itself. Do not advertise this as a complete web-research capability.

For this experiment:

1. Choose an actual pilot workflow and about 20 representative pages, including known hard cases. Define expected facts or observable outcomes before testing. Record content accuracy, failures, p50/p95 end-to-end latency, output bytes, setup effort, and fallback frequency across repeated runs.
2. Use public, non-sensitive pages initially. Treat page output as untrusted evidence. Test that an injected instruction cannot bypass approval for a separate side-effecting tool.
3. Constrain destinations at the browser's network boundary, covering redirects, subresources, and private addresses. An initial URL allowlist alone is insufficient. Do not assume general Browser Run guardrails support Kitesurf without verifying that combination.
4. Keep tokens in the host secret environment and out of model arguments, context, artifacts, and diagnostic messages. Configure deadlines, cancellation propagation, response-size bounds, and bounded handling of rate limits.
5. Test crash-before-result recovery and cancellation. Reads may repeat and may observe changed pages; recorded completed reads should replay without another request. Keep authenticated mutations out of this first slice.
6. Use fixtures for offline evals and CI; keep the live compatibility corpus as an explicit optional check. Validate the example through `validateProject`.

Fallback must be explicit: return a recognizable unsupported/failed outcome or use an operator-configured Chromium fallback and record it. Silent switching hides compatibility failures, changes costs, and can change where data goes.

## Adoption gates and scope

Promote an optional recipe only if a real workflow needs rendering, the experiment demonstrates acceptable content quality and reliability, and its complete cost and operating burden compare favorably with alternatives. The maintainer should choose numeric service targets from that workflow before running the comparison; this audit invents no universal success threshold.

Consider a reusable browser adapter only after multiple applications need shared behavior. General interactive browsing would first need explicit decisions about browser lifetime, checkpoint/recovery semantics, tenant and credential isolation, per-action approval granularity, and artifact retention. Kitesurf should remain replaceable behind that seam.

**Roadmap action now: retain the evidence and recommendation, with no epic or issue edits.** A later narrow example needs an explicit scope decision; do not silently expand #77 or existing M2 work. An approved implementation should follow public-surface TDD and update README/docs; this research-only change adds no published behavior and needs no changeset or runtime tests.
