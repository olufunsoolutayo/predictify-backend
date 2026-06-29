/**
 * Jest preset for integration tests using Testcontainers Postgres.
 *
 * Usage:
 *   --config jest.integration.config.js
 */

module.exports = {
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
  testEnvironment: "node",
  globalSetup: "<rootDir>/tests/integration/globalSetup.js",
  globalTeardown: "<rootDir>/tests/integration/globalTeardown.js",
  setupFiles: ["<rootDir>/tests/integration/setup.js"],
  testMatch: ["**/tests/integration/**/*.test.ts"],
  testTimeout: 120000,
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
};
