# Cloudflare Pages Deployment

The website package deploys as a static Astro site to:

- Production URL: `https://plico.sohab.dev`
- Cloudflare Pages project: `plico`
- Package: `@plico/website`
- Build output: `packages/website/dist`

`packages/website/astro.config.mjs` already sets `site` to `https://plico.sohab.dev`.

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
| Framework preset | `Astro` or `None` |
| Build command | `pnpm --filter @plico/website build` |
| Build output directory | `packages/website/dist` |

Set these environment variables in the Pages project if Cloudflare does not infer them:

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `PNPM_VERSION` | `10.12.4` |

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
pnpm --filter @plico/website deploy:pages
```

For a preview deployment:

```sh
pnpm --filter @plico/website deploy:pages:preview
```

These commands build `packages/website/dist` and upload it with Wrangler. You must be authenticated with Cloudflare first:

```sh
pnpm dlx wrangler@latest login
```

For CI-based Direct Upload instead of Git-connected Pages, add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as GitHub secrets, then run the same Wrangler `pages deploy` command from a workflow.
