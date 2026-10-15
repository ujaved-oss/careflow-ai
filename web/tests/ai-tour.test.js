import {test} from 'node:test';import assert from 'node:assert/strict';import {nextDemoSkill,demonstratedSkills,tourPaymentExample} from '../shared/ai-tour.js';
const done=capability=>({event:'Demo assistant activity',capability});
test('the guided AI journey covers each skill and explicitly resolves the missing note',()=>{const c={can_act:true,stage:'INTAKE',history:[done('intake')]};for(const id of ['classify','completeness','request']){assert.equal(nextDemoSkill(c).id,id);c.history.push(done(id));}assert.equal(nextDemoSkill(c).sample,'clinical');c.history.push({event:'Demo assistant activity',document_kind:'clinical'});assert.equal(nextDemoSkill(c).id,'completeness');c.history.push(done('completeness'));assert.equal(nextDemoSkill(c),null);c.stage='DOCTOR_REVIEW';for(const id of ['handoff','ask']){assert.equal(nextDemoSkill(c).id,id);c.history.push(done(id));}c.stage='INSURANCE';for(const id of ['authorization','response']){assert.equal(nextDemoSkill(c).id,id);c.history.push(done(id));}c.stage='PAYMENT';assert.equal(tourPaymentExample(c).status,'Denied');c.stage='CLAIM_FOLLOWUP';assert.equal(nextDemoSkill(c).id,'denial');c.history.push(done('denial'));assert.equal(tourPaymentExample(c).status,'Paid');c.stage='CLOSURE';assert.equal(nextDemoSkill(c).id,'followup');c.history.push(done('followup'));assert.equal(demonstratedSkills(c).length,10);assert.equal(nextDemoSkill(c),null);assert.equal(nextDemoSkill({...c,can_act:false}),null);});

test('opening the returned-note helper and closing it cannot skip the checklist',()=>{
 const c={can_act:true,stage:'INTAKE',history:['intake','classify','completeness','request'].map(done)};
 c.history.push({event:'Demo assistant activity',document_kind:'clinical'});
 // Opening the helper attaches its sample. Closing it runs nothing.
 assert.equal(nextDemoSkill(c).id,'completeness');
 assert.match(nextDemoSkill(c).note,/Run the checklist again/);
 // Other agent activity or a similarly named event is not the required run.
 c.history.push(done('handoff'),{event:'Unrelated activity',capability:'completeness'});
 assert.equal(nextDemoSkill(c).id,'completeness');
 assert.equal(nextDemoSkill({...c,can_act:false}),null);
 c.history.push(done('completeness'));
 assert.equal(nextDemoSkill(c),null);
});

test('a later supporting paper requires a fresh completeness run in saved order',()=>{
 const at='2026-10-15T09:00:00.000Z';
 const c={can_act:true,stage:'INTAKE',history:['intake','classify','completeness','request'].map(done)};
 c.history.push({event:'Demo assistant activity',document_kind:'clinical',created_at:at},{...done('completeness'),created_at:at});
 assert.equal(nextDemoSkill(c),null);
 // Same timestamps must not let the previous check cover a newly added paper.
 c.history.push({event:'Demo assistant activity',document_kind:'clinical',created_at:at});
 assert.equal(nextDemoSkill(c).id,'completeness');
 c.history.push({...done('completeness'),created_at:at});
 assert.equal(nextDemoSkill(c),null);
});
