import assert from "node:assert/strict";
import test from "node:test";
import { inspectServerConfiguration } from "../lib/server-configuration.ts";

const coreEnvironment = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SECRET_KEY: "server-only-test-secret",
  NEXT_PUBLIC_APP_URL: "https://jvh.example",
};

test("accepts a valid core server configuration without exposing values", () => {
  const report = inspectServerConfiguration(coreEnvironment);
  assert.equal(report.coreReady, true);
  assert.deepEqual(report.coreMissing, []);
  assert.equal(report.recommended[0]?.status, "ready");
});

test("reports missing or malformed core settings by variable name", () => {
  const report = inspectServerConfiguration({
    SUPABASE_URL: "not-a-url",
    SUPABASE_SERVICE_ROLE_KEY: "",
  });
  assert.equal(report.coreReady, false);
  assert.deepEqual(report.coreMissing, [
    "SUPABASE_URL (valid http(s) URL)",
    "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY",
  ]);
});

test("marks incomplete optional integrations as disabled without blocking core", () => {
  const report = inspectServerConfiguration({
    ...coreEnvironment,
    HEAR_SERVICE_URL: "http://127.0.0.1:8017",
  });
  assert.equal(report.coreReady, true);
  assert.equal(report.optional.find((item) => item.id === "hear")?.status, "disabled");
  assert.equal(report.optional.find((item) => item.id === "gemini")?.status, "disabled");
});
