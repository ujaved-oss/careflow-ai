import {test} from 'node:test';import assert from 'node:assert/strict';
import {mockProvider,documentKind} from '../server/ai-engine.js';
import {samplePaper} from '../shared/demo-papers.js';
test('capability 1 reads source fields, leaves absent facts blank and refuses unsupported procedures',()=>{
 const paper={...samplePaper('referral'),id:'doc-1'};paper.kind=documentKind(paper);const r=mockProvider.run({capability:'intake',documents:[paper]});
 assert.equal(r.provider,'simulation');assert.equal(r.fields.find(f=>f.name==='patient_name').value,'Amelia Brooks');assert.equal(r.evidence.find(e=>e.quote==='Patient: Amelia Brooks').line,2);
 const missing=mockProvider.run({capability:'intake',documents:[{...paper,text:'Document type: Referral\nPatient: Test Patient\nRequested test: CT head'}]});assert.equal(missing.fields.find(f=>f.name==='external_reference').value,'');assert.equal(missing.fields.find(f=>f.name==='procedure').status,'unsupported');
});
