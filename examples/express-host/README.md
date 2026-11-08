# Express host

An Express app that mounts a Plico agent under `/plico` and keeps each user's threads and runs to themselves.

- `agent/` is the Plico project: the files define the agent.
- `src/app.ts` runs `createPlico`, then mounts `plico.node({ scope, context })` behind a login check. The `x-user-id` header stands in for your session.
- `src/app.test.ts` shows user `bob` getting `404` for user `ann`'s thread.

```sh
pnpm --filter @plico/example-express-host start
curl -X POST localhost:3000/plico/v1/threads -H 'x-user-id: ann' -H 'content-type: application/json' -d '{}'
```

Run Studio beside it without letting it act on the app's runs:

```sh
plico serve --studio --inspect --db plico.sqlite agent
```

See [Use Plico from your backend](../../packages/docs/content/docs/backend.mdx).
