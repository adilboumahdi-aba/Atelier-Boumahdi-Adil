import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Mesh convergence tests simulate hundreds of virtual nodes; give them room.
    testTimeout: 30_000,
  },
});
