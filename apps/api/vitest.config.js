import { defineConfig } from "vitest/config";
export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["src/**/*.spec.ts"],
    },
});
//# sourceMappingURL=vitest.config.js.map