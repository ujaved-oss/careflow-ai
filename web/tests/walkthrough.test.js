import {test} from 'node:test';
import assert from 'node:assert/strict';
import {walkthroughTasks,nextInstruction,canComplete,nextCheckpoint,sampleDetails} from '../src/walkthrough.js';
import {buildGuideState,guideMetrics} from '../src/guide-model.js';
test('hands-on journey requires every expected field and explicit action to reach closure',()=>{
 let index=0;
 for(const task of walkthroughTasks){
  const values={};
  assert.equal(nextCheckpoint(index,Object.fromEntries(task.fields.map(f=>[f.key,f.value]))),index+1);
  if(task.fields.length){assert.equal(canComplete(task,values),false);assert.throws(()=>nextCheckpoint(index,values));}
  for(const field of task.fields){
   assert.equal(nextInstruction(task,values).target,field.key);
   values[field.key]=field.type==='checkbox'?false:'wrong sample';
   assert.equal(canComplete(task,values),false);
   values[field.key]=field.value;
  }
  assert.equal(nextInstruction(task,values).target,'submit');
  index=nextCheckpoint(index,values);
 }
 assert.equal(index,25);
 const final=buildGuideState(index,1000);
 assert.equal(final.cases[0].overall_status,'FULLY_RESOLVED');
 assert.equal(final.appointments.length,1);
 assert.equal(new Date(final.appointments[0].scheduled_at).getHours(),9);
 assert.equal(final.appointments[0].location,'Sample MRI room A');
 assert.equal(final.cases[0].authorization_reference,'AUTH-DEMO-1041');
 assert.equal(final.cases[0].bill_reference,'CLAIM-DEMO-1041');
 assert.equal(final.approvals[0].proposed_payload.message,"Please send Amelia's doctor's note.");
 assert.deepEqual(guideMetrics(final).map(m=>m.value),[1,4,3,5,0,25]);
});
test('intake start, wrong data and replay cannot silently skip a practice step',()=>{
 const task=walkthroughTasks[0],valid=Object.fromEntries(task.fields.map(f=>[f.key,f.value]));
 assert.equal(nextInstruction(task,{},false).target,'start');
 assert.equal(canComplete(task,valid,false),false);
 assert.throws(()=>nextCheckpoint(0,valid,false),/New case/);
 assert.throws(()=>nextCheckpoint(0,{...valid,patient:'Other patient'}),/Amelia Hart/);
 assert.equal(buildGuideState(0,1000).cases.length,0);
 assert.equal(nextCheckpoint(0,{...valid,patient:' amelia hart '}),1);
 assert.throws(()=>nextCheckpoint(25,{}),/finished/);
});
test('sample shortcut fixes a mistaken request without approving a review or creating a case',()=>{
 const task=walkthroughTasks[0],details=sampleDetails(task);
 assert.equal(details.reference,'SYN-EMAIL-1041');
 assert.equal(details.order,'MRI brain');
 assert.equal(details.review,undefined);
 assert.equal(canComplete(task,details),false);
 assert.throws(()=>nextCheckpoint(0,details),/Check/);
 assert.equal(nextCheckpoint(0,{...details,review:true}),1);
 assert.throws(()=>nextCheckpoint(0,{...details,reference:'Amelia Hart',review:true}),/SYN-EMAIL-1041/);
});
