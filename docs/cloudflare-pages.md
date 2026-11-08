# Cloudflare Pages Deployment

The site deploys as a static site to the URL below. `@plico/docs` is a Fumadocs Next.js static export that serves both the homepage at `/` and the docs at `/docs`.

- Production URL: `https://plico.sohab.dev`
- Cloudflare Pages project: `plico`
- Package: `@plico/docs`
- Build output: `packages/docs/out`

`packages/docs/lib/shared.ts` sets `siteUrl` to `https://plico.sohab.dev`.

## Recommended: Git-Connected Pages

Create the Pages project from the Cloudflare dashboard:

1. Go to **Workers & Pages**.
2. Select **Create application**.
3. Select **Pages**.
4. Import the GitHub repository.
5. Use these build settings:

| Setting | Value |
| --- | --- |
| Project name | `plico` |
| Production branch | `main` |
| Root directory | `/` |
| Framework preset | `None` |
| Build command | `pnpm --filter @plico/docs build` |
| Build output directory | `packages/docs/out` |

Set these environment variables in the Pages project if Cloudflare does not infer them:

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `PNPM_VERSION` | `10.12.4` |

Old `/docs/welcome` links redirect through `packages/docs/public/_redirects`. `packages/docs/public/_worker.js` (Pages advanced mode) serves a docs page as Markdown when the request sends `Accept: text/markdown`, and passes everything else to the static assets.

Cloudflare will install dependencies and deploy again on pushes to `main`.

## Custom Subdomain

After the first deployment succeeds:

1. Open **Workers & Pages > plico > Custom domains**.
2. Select **Set up a domain**.
3. Enter `plico.sohab.dev`.
4. Confirm the DNS record Cloudflare proposes.

If `sohab.dev` is already managed in the same Cloudflare account, Cloudflare should create the CNAME automatically. If DNS is managed elsewhere, create:

| Type | Name | Target |
| --- | --- | --- |
| `CNAME` | `plico` | `plico.pages.dev` |

Do not create only the DNS record without adding `plico.sohab.dev` as a Pages custom domain first; Cloudflare documents that this can produce a 522.

## Manual Direct Upload

For a one-off manual deployment from your local machine:

```sh
pnpm --filter @plico/docs deploy:pages
```

For a preview deployment:

```sh
pnpm --filter @plico/docs deploy:pages:preview
```

These commands build the site into `packages/docs/out` and upload it with Wrangler. You must be authenticated with Cloudflare first:

```sh
pnpm dlx wrangler@latest login
```

For CI-based Direct Upload instead of Git-connected Pages, add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as GitHub secrets, then run the same Wrangler `pages deploy` command from a workflow.
