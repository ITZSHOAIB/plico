import { startApp } from "./app.js";

await startApp(Number(process.env.PORT ?? 3000));
