import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
test("viewer requests never reach the backend, edits are denied and regular demo data survives", async () => {
  const memory = (seed = {}) => ({
    getItem: (k) => seed[k] ?? null,
    setItem: (k, v) => {
      seed[k] = v;
    },
    removeItem: (k) => {
      delete seed[k];
    },
  });
  const regular = JSON.stringify({
    users: [],
    cases: [{ id: "keep-this-case" }],
    documents: [],
    approvals: [],
    tasks: [],
    events: [],
    appointments: [],
  });
  globalThis.localStorage = memory({ "careflow-presentation-v1": regular });
  globalThis.sessionStorage = memory();
  let networkCalls = 0;
  globalThis.fetch = () => {
    networkCalls++;
    throw new Error("Unexpected network call");
  };
  const bundle = await build({
    entryPoints: ["src/gateway.js"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    define: { "import.meta.env.DEV": "true" },
  });
  const gateway = await import(
    "data:text/javascript;base64," +
      Buffer.from(bundle.outputFiles[0].text).toString("base64")
  );
  assert.equal(gateway.connected, true);
  gateway.enterViewer();
  assert.equal(gateway.connected, false);
  assert.equal((await gateway.request("/cases")).total, 0);
  assert.equal((await gateway.request("/auth/me")).role, "viewer");
  gateway.viewerCheckpoint(23);
  assert.equal(
    (await gateway.request("/cases")).items[0].overall_status,
    "FULLY_RESOLVED",
  );
  await assert.rejects(
    gateway.request("/demo/events", { event_type: "claim_paid" }),
    /read-only/,
  );
  await assert.rejects(
    gateway.request("/tasks/tour-task", { status: "OPEN" }, "PATCH"),
    /read-only/,
  );
  assert.equal(networkCalls, 0);
  assert.equal(localStorage.getItem("careflow-presentation-v1"), regular);
  gateway.logout();
  assert.equal(gateway.connected, true);
  assert.equal(sessionStorage.getItem("careflow-viewer-mode"), null);
  assert.throws(() => gateway.viewerCheckpoint(0), /isolated viewer/);
});
