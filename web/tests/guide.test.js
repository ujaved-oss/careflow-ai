import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGuideState, guideMetrics } from "../src/guide-model.js";
import { productAnswer, guideSteps } from "../src/guide-content.js";
test("viewer starts without records or a live hospital identity", () => {
  const s = buildGuideState(0, 1000);
  for (const key of [
    "cases",
    "documents",
    "approvals",
    "tasks",
    "events",
    "appointments",
  ])
    assert.equal(s[key].length, 0);
  assert.equal(s.users[0].role, "viewer");
  assert.equal(s.users[0].tenant_id, "tour");
});
test("administrative, booking, clinical and financial milestones remain independent", () => {
  const docs = buildGuideState(6, 1000).cases[0];
  assert.equal(docs.document_status, "COMPLETE");
  assert.equal(docs.authorization_status, "PENDING");
  assert.equal(docs.scheduling_status, "NOT_SCHEDULED");
  const payer = buildGuideState(9, 1000).cases[0];
  assert.equal(payer.clinical_status, "PENDING");
  assert.equal(payer.scheduling_status, "NOT_SCHEDULED");
  const booked = buildGuideState(12, 1000).cases[0];
  assert.equal(booked.scheduling_status, "CONFIRMED");
  assert.notEqual(booked.overall_status, "FULLY_RESOLVED");
  const clinical = buildGuideState(19, 1000).cases[0];
  assert.equal(clinical.clinical_status, "COMMUNICATION_COMPLETE");
  assert.equal(clinical.financial_status, "NOT_STARTED");
});
test("results are counted from the journey and replay cannot duplicate decisions", () => {
  const end = buildGuideState(guideSteps.length - 1, 1000);
  assert.equal(end.cases[0].overall_status, "FULLY_RESOLVED");
  assert.deepEqual(
    guideMetrics(end)
      .slice(0, 5)
      .map((x) => x.value),
    [1, 4, 3, 5, 0],
  );
  assert.equal(new Set(end.events.map((e) => e.id)).size, end.events.length);
  assert.equal(
    end.approvals.some((a) => a.status === "AWAITING_APPROVAL"),
    false,
  );
  const before = buildGuideState(4, 1000);
  assert.equal(before.approvals[0].status, "AWAITING_APPROVAL");
  assert.equal(before.documents.length, 1);
  assert.deepEqual(buildGuideState(25, 1000), end);
  assert.deepEqual(buildGuideState(4, 1000), before);
});
test("every chapter is reachable and out-of-scope product answers remain honest", () => {
  for (let i = 0; i < guideSteps.length; i++)
    assert.equal(buildGuideState(i, 1000).guideIndex, i);
  assert.throws(() => buildGuideState(26), /Unknown/);
  assert.throws(() => buildGuideState(-1), /Unknown/);
  assert.match(
    productAnswer("What is the price in Malaysia?"),
    /beyond the verified demo/,
  );
  assert.match(
    productAnswer("What is your pricing for my hospital?"),
    /beyond the verified demo/,
  );
  assert.match(
    productAnswer("Is the assistant a live LLM?"),
    /not been connected/,
  );
  assert.match(productAnswer("Does this improve revenue?"), /no claim/);
});
