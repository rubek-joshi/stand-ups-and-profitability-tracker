import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.e2e-spec.ts"],
    fileParallelism: false,
    // BullMQ/ioredis can emit "Connection is closed" after Nest teardown.
    dangerouslyIgnoreUnhandledErrors: true,
  },
  plugins: [
    swc.vite({
      module: { type: "es6" },
    }),
  ],
});
