import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mockProvider} from '../server/ai-engine.js';
import {samplePaper} from '../shared/demo-papers.js';
import {supportingNoteFromRun} from '../shared/agent-review.js';

const caseRecord = {
  id: 'CF-REVIEW',
  patient_name: 'Amelia Brooks',
  external_reference: 'SYN-REVIEW',
  procedure: 'MRI brain',
};
const paper = (kind, id, changes = {}) => ({
  id,
  ...samplePaper(kind, {...caseRecord, ...changes}),
});
const referral = paper('referral', 'doc-referral');
const clinical = paper('clinical', 'doc-clinical');
const noteText = document => document.text.split('\n')
  .find(line => line.startsWith('Supporting note:'))
  .slice('Supporting note:'.length).trim();

function completedChecklist(documents) {
  return {
    document_ids: documents.map(document => document.id),
    output: mockProvider.run({
      capability: 'completeness',
      caseRecord,
      documents,
      at: '2026-10-15T09:00:00Z',
    }),
  };
}

test('a missing clinical paper never fills the supporting-note field', () => {
  const run = completedChecklist([referral]);
  assert.equal(run.output.checks.find(check => check.label === 'Supporting note').status, 'missing');
  assert.equal(supportingNoteFromRun(run), null);
});

test('a complete matching checklist fills only the exact cited supporting note', () => {
  const run = completedChecklist([referral, clinical]);
  assert.ok(run.output.checks.every(check => check.status === 'found'));
  assert.ok(run.output.evidence.some(source => source.source_id === clinical.id));
  assert.equal(supportingNoteFromRun(run), noteText(clinical));
});

test('a patient mismatch blocks copying even when a matching supporting note was found', () => {
  const wrongPatient = paper('clinical', 'doc-other-patient', {patient_name: 'Jordan Sample'});
  const run = completedChecklist([referral, clinical, wrongPatient]);
  assert.equal(run.output.checks.find(check => check.label === 'Supporting note').status, 'found');
  assert.ok(run.output.checks.some(check => check.status === 'conflict'));
  assert.ok(run.output.evidence.some(source => source.source_id === clinical.id));
  assert.equal(supportingNoteFromRun(run), null);
});

test('a source quote cannot fill the note when its document is not attached to the run', () => {
  const run = completedChecklist([referral, clinical]);
  run.document_ids = [referral.id];
  assert.ok(run.output.checks.every(check => check.status === 'found'));
  assert.ok(run.output.evidence.some(source => source.source_id === clinical.id));
  assert.equal(supportingNoteFromRun(run), null);
});
