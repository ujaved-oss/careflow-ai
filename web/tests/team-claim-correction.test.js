import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {teamAPI} from '../server/team-api.js';
import {sqliteBinding} from '../server/sqlite-adapter.js';

async function claimCase(t) {
  const DB = sqliteBinding();
  DB.database.exec(readFileSync('drizzle/0000_team.sql', 'utf8'));
  t.after(() => DB.database.close());
  const tokens = {};
  const call = async (path, actor, body) => {
    const response = await teamAPI(new Request('https://careflow.test/team-api' + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        'oai-authenticated-user-id': 'owner',
        ...(tokens[actor] ? {authorization: `Bearer ${tokens[actor]}`} : {}),
      },
      ...(body ? {body: JSON.stringify(body)} : {}),
    }), {DB});
    return {status: response.status, data: await response.json()};
  };
  for (const actor of ['admin', 'intake', 'doctor', 'insurance', 'scheduler', 'claims']) {
    const login = await call('/auth/demo-login', actor, {user_id: actor});
    assert.equal(login.status, 200);
    tokens[actor] = login.data.access_token;
  }
  const created = await call('/cases', 'admin', {
    operation_id: crypto.randomUUID(),
    patient_name: 'Fictional Claim Review',
    external_reference: 'SYN-CLAIM-CORRECTION',
    procedure: 'MRI brain', source: 'paper', order_note: 'Fictional signed order',
    reviewed: true,
  });
  assert.equal(created.status, 200);
  const path = `/cases/${created.data.case_id}`;
  const get = async actor => (await call(path, actor)).data;
  const submit = async (actor, action, fields = {}) => {
    const current = await get(actor);
    return call(path + '/action', actor, {
      operation_id: crypto.randomUUID(), action,
      expected_version: current.version, reviewed: true, ...fields,
    });
  };
  const step = async (actor, action, fields = {}) => {
    const result = await submit(actor, action, fields);
    assert.equal(result.status, 200, JSON.stringify(result.data));
  };
  await step('intake', 'send_doctor', {doctor_note: 'Fictional supporting note'});
  await step('doctor', 'doctor_approve', {note: 'Fictional order reviewed'});
  await step('insurance', 'insurance_answer', {
    status: 'Approved', medium: 'Email / letter', reference: 'SAMPLE-AUTH', evidence: 'Fictional approval',
  });
  await step('scheduler', 'book', {
    scheduled_at: new Date(Date.now() + 86400000).toISOString(), location: 'Sample room',
  });
  await step('doctor', 'ready', {note: 'Fictional before-visit check'});
  await step('doctor', 'finish_visit', {simulate_visit_day: true});
  await step('doctor', 'finish_report', {report_text: 'Fictional report'});
  await step('doctor', 'share_report', {recipient: 'Sample practice'});
  return {call, get, submit, step, path};
}

test('claim correction survives payment and remains visible only to claims staff', async t => {
  const h = await claimCase(t);
  await h.step('claims', 'submit_claim', {reference: 'CLAIM-FIRST', amount: 100});
  const denial = 'Fictional payer said the supporting attachment was missing.';
  await h.step('claims', 'payment_answer', {status: 'Denied', reference: 'DENIAL-FIRST', evidence: denial});
  const correction = 'Fictional correction: the missing supporting attachment was checked for this resubmission. No real claim was sent.';
  const current = await h.get('claims');
  const resubmit = {
    operation_id: crypto.randomUUID(), action: 'submit_claim', reviewed: true,
    expected_version: current.version, reference: 'CLAIM-CORRECTED', amount: 100,
    correction_note: correction,
  };
  assert.equal((await h.call(h.path + '/action', 'claims', resubmit)).status, 200);
  assert.equal((await h.call(h.path + '/action', 'claims', resubmit)).status, 200);
  await h.step('claims', 'payment_answer', {status: 'Paid', reference: 'PAY-FINAL', evidence: 'Fictional payment received'});
  const claims = await h.get('claims');
  assert.equal(claims.stage, 'CLOSURE');
  assert.equal(claims.payment_evidence, 'Fictional payment received');
  assert.ok(claims.claim_responses.some(response => response.evidence === denial));
  const corrections = claims.history.filter(event => event.evidence === correction);
  assert.equal(corrections.length, 1, 'retry must not save a second correction');
  assert.equal(corrections[0].event, 'Claim submitted');
  assert.equal(corrections[0].evidence_scope, 'work.claims');
  assert.match(corrections[0].note, /CLAIM-CORRECTED/);
  for (const actor of ['admin', 'scheduler']) {
    const visible = await h.get(actor);
    const visibleCorrection = visible.history.find(event => event.id === corrections[0].id);
    assert.ok(visibleCorrection, 'other staff still see the workflow event');
    assert.equal(visibleCorrection.evidence, undefined);
    assert.equal(JSON.stringify(visible).includes(correction), false);
    const snapshot = await h.call('/snapshot', actor);
    assert.equal(snapshot.status, 200);
    assert.equal(JSON.stringify(snapshot.data).includes(correction), false);
  }
});

test('correction validation rejects misplaced or invalid notes without changing the case', async t => {
  const h = await claimCase(t);
  const claim = {reference: 'CLAIM-FIRST', amount: 100};
  const first = await h.get('claims');
  assert.equal((await h.submit('claims', 'submit_claim', {...claim, correction_note: 'No denial exists yet.'})).status, 400);
  assert.deepEqual(await h.get('claims'), first);
  await h.step('claims', 'submit_claim', claim);
  await h.step('claims', 'payment_answer', {status: 'Denied', reference: 'DENIAL-FIRST', evidence: 'Fictional missing attachment'});
  const denied = await h.get('claims');
  for (const correction_note of ['', '   ', 'x'.repeat(1001), null, 7, {text: 'Untrusted object'}]) {
    assert.equal((await h.submit('claims', 'submit_claim', {...claim, correction_note})).status, 400);
    assert.deepEqual(await h.get('claims'), denied);
  }
  await h.step('claims', 'submit_claim', {...claim, reference: 'LEGACY-RETRY'});
  const legacy = await h.get('claims');
  assert.equal(legacy.stage, 'PAYMENT');
  assert.equal(legacy.history.at(-1).evidence, undefined, 'older clients do not invent a correction');
});
