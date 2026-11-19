import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["shared/test/**/*.vitest.ts", "server/test/**/*.vitest.ts", "client/test/**/*.vitest.ts"], coverage: { provider: "v8", include: ["shared/src/**/*.ts"], thresholds: { lines: 85, functions: 85, branches: 85, statements: 85 } } } });
