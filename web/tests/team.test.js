import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {teamAPI,repository} from '../server/team-api.js';
import {sqliteBinding} from '../server/sqlite-adapter.js';
function harness(){const DB=sqliteBinding();DB.database.exec(readFileSync('drizzle/0000_team.sql','utf8'));const principal='owner-identity';return {DB,async call(path,{token='',body,identity=principal,email='owner@example.invalid',method=body?'POST':'GET'}={}){const headers={'oai-authenticated-user-id':identity,'oai-authenticated-user-email':email,...(token?{Authorization:`Bearer ${token}`}:{})};const request=new Request('https://careflow.test/team-api'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});const response=await teamAPI(request,{DB});return {status:response.status,data:await response.json()};},async login(person,identity=principal,email='owner@example.invalid'){const r=await this.call('/auth/demo-login',{body:{user_id:person},identity,email});assert.equal(r.status,200);return r.data.access_token;}};}
const op=body=>({...body,operation_id:crypto.randomUUID()});
test('shared database starts empty, routes a case through six jobs, and closes once',async()=>{
 const h=harness(),tokens={};for(const id of ['admin','intake','doctor','insurance','scheduler','claims']){tokens[id]=await h.login(id);const {data}=await h.call('/snapshot',{token:tokens[id]});assert.equal(data.cases.length,0);assert.equal(data.queue.length,0);}
 const input=op({patient_name:'QA Fictional Patient',external_reference:'SYN-TEST-1',source:'email',procedure:'MRI brain',order_note:'Sample request',doctor_note:'Sample supporting paper',reviewed:true});
 const created=await h.call('/cases',{token:tokens.admin,body:input});assert.equal(created.status,200);const caseId=created.data.case_id;
 const repeated=await h.call('/cases',{token:tokens.admin,body:input});assert.equal(repeated.data.case_id,caseId);assert.equal((await h.call('/snapshot',{token:tokens.admin})).data.cases.length,1);
 const get=async id=>(await h.call(`/cases/${caseId}`,{token:tokens[id]})).data;
 const step=async(id,action,fields={})=>{const c=await get(id),body=op({action,expected_version:c.version,reviewed:true,...fields});const result=await h.call(`/cases/${caseId}/action`,{token:tokens[id],body});assert.equal(result.status,200,JSON.stringify(result.data));return get(id);};
 let c=await step('intake','send_doctor',{doctor_note:'QA supporting paper'});assert.equal(c.owner_id,'doctor');assert.equal((await h.call('/snapshot',{token:tokens.doctor})).data.queue.length,1);assert.equal((await h.call('/snapshot',{token:tokens.insurance})).data.queue.length,0);
 c=await step('doctor','doctor_approve',{note:'QA order review'});assert.equal(c.owner_id,'insurance');assert.equal((await h.call('/snapshot',{token:tokens.doctor})).data.queue.length,0);
 c=await step('insurance','insurance_answer',{status:'Pending',medium:'Insurer portal',reference:'AUTH-QA',evidence:'Waiting in sample portal'});assert.equal(c.stage,'INSURANCE');
 c=await step('insurance','insurance_answer',{status:'Approved',medium:'Email / letter',reference:'AUTH-QA',evidence:'Sample approval letter'});assert.equal(c.owner_id,'scheduler');
 const before=await get('scheduler'),book=op({action:'book',expected_version:before.version,reviewed:true,scheduled_at:new Date(Date.now()+86400000).toISOString(),location:'QA room A'});
 assert.equal((await h.call(`/cases/${caseId}/action`,{token:tokens.scheduler,body:book})).status,200);assert.equal((await h.call(`/cases/${caseId}/action`,{token:tokens.scheduler,body:book})).status,200);c=await get('doctor');assert.equal(c.history.filter(e=>e.event==='Appointment booked').length,1);assert.equal(c.owner_id,'doctor');
 await step('doctor','ready',{note:'PRIVATE QA before-visit note'});await step('doctor','finish_visit',{simulate_visit_day:true});await step('doctor','finish_report',{report_text:'PRIVATE QA report'});c=await step('doctor','share_report',{recipient:'QA referring practice'});assert.equal(c.owner_id,'claims');
 const claimView=await get('claims');assert.equal(claimView.report_text,undefined);assert.equal(claimView.previsit_note,undefined);assert.equal(claimView.doctor_review_note,undefined);
 await step('claims','submit_claim',{reference:'CLAIM-QA',amount:100,currency:'AED'});c=await step('claims','payment_answer',{status:'Paid',reference:'PAY-QA',evidence:'QA sample payment notice'});assert.equal(c.owner_id,'admin');
 const adminView=await get('admin');assert.equal(adminView.report_text,undefined);assert.equal(adminView.claim_amount,undefined);
 c=await step('admin','close');assert.equal(c.stage,'CLOSED');for(const id of Object.keys(tokens))assert.equal((await h.call('/snapshot',{token:tokens[id]})).data.queue.length,0);
 const invalid=await h.call(`/cases/${caseId}/action`,{token:tokens.admin,body:op({action:'close',expected_version:c.version,reviewed:true})});assert.equal(invalid.status,403);
 assert.equal((await h.call(`/cases/${caseId}/action`,{token:tokens.doctor,body:op({action:'archive',expected_version:c.version})})).status,403);
 await step('admin','archive');for(const id of Object.keys(tokens))assert.equal((await h.call('/snapshot',{token:tokens[id]})).data.cases.length,0);
 assert.equal((await h.call(`/cases/${caseId}`,{token:tokens.doctor})).status,404);assert.equal((await h.call('/team',{token:tokens.admin})).data.archives.length,1);
 c=await step('admin','restore');assert.equal(c.stage,'CLOSED');assert.equal(c.archived,false);assert.equal(c.history.at(-1).event,'Case restored');
});
test('permissions, ownership, stale forms, custom accounts and platform identity are enforced server-side',async()=>{
 const h=harness();const unauth=await teamAPI(new Request('https://careflow.test/team-api/auth/demo-users'),{DB:h.DB});assert.equal(unauth.status,401);
 const admin=await h.login('admin'),doctor=await h.login('doctor'),claims=await h.login('claims'),intake=await h.login('intake');
 assert.equal((await h.call('/team',{token:doctor})).status,403);
 const created=await h.call('/cases',{token:admin,body:op({patient_name:'QA Patient',external_reference:'SYN-PERM',source:'desk',procedure:'MRI knee',order_note:'QA order',doctor_note:'QA note',reviewed:true})});const id=created.data.case_id;
 const c=(await h.call(`/cases/${id}`,{token:admin})).data;
 assert.equal((await h.call(`/cases/${id}/action`,{token:claims,body:op({action:'send_doctor',expected_version:c.version,reviewed:true,doctor_note:'QA note',permissions:['work.intake']})})).status,403);
 assert.equal((await h.call(`/cases/${id}/action`,{token:admin,body:op({action:'send_doctor',expected_version:999,reviewed:true,doctor_note:'QA note'})})).status,409);
 assert.equal((await h.call(`/cases/${id}/action`,{token:intake,body:op({action:'close',expected_version:c.version,reviewed:true})})).status,409);
 const role=await h.call('/roles',{token:admin,body:op({name:'QA Claims assistant',permissions:['work.claims']})});assert.equal(role.status,200);
 const account=await h.call('/accounts',{token:admin,body:op({name:'QA Staff Member',email:'qa.claims@example.invalid',role_id:role.data.role_id})});assert.equal(account.status,200);
 const member=await h.call('/auth/demo-login',{identity:'other-platform-person',email:'qa.claims@example.invalid',body:{user_id:'admin'}});assert.equal(member.data.user.id,account.data.account_id);
 const {data:snapshot}=await h.call('/snapshot',{identity:'other-platform-person',email:'qa.claims@example.invalid',token:member.data.access_token});assert.equal(snapshot.cases.length,0);assert.equal(snapshot.user.can_preview,false);
 assert.equal((await h.call(`/cases/${id}`,{identity:'other-platform-person',email:'qa.claims@example.invalid',token:member.data.access_token})).status,404);
 assert.equal((await h.call('/team',{identity:'other-platform-person',email:'qa.claims@example.invalid',token:member.data.access_token})).status,403);
 assert.equal((await h.call('/snapshot',{identity:'another-person',email:'qa.claims@example.invalid',token:member.data.access_token})).status,401);
 assert.equal((await h.call(`/accounts/${account.data.account_id}`,{token:admin,body:op({active:false})})).status,200);
 assert.equal((await h.call('/snapshot',{identity:'other-platform-person',email:'qa.claims@example.invalid',token:member.data.access_token})).status,403);
 assert.equal((await h.call('/roles',{token:doctor,body:op({name:'Fake admin',permissions:['team.manage']})})).status,403);
});
test('denied insurance returns to intake, doctor can return papers, and denied claims stay with claims',async()=>{
 const h=harness(),admin=await h.login('admin'),intake=await h.login('intake'),doctor=await h.login('doctor'),insurance=await h.login('insurance');
 const r=await h.call('/cases',{token:admin,body:op({patient_name:'QA Return',external_reference:'SYN-RETURN',source:'paper',procedure:'MRI brain',order_note:'QA order',reviewed:true})});const id=r.data.case_id;
 const action=async(token,name,extra={})=>{const c=(await h.call(`/cases/${id}`,{token})).data;return h.call(`/cases/${id}/action`,{token,body:op({action:name,expected_version:c.version,reviewed:true,...extra})});};
 await action(intake,'send_doctor',{doctor_note:'QA note'});await action(doctor,'doctor_return',{note:'Need a clearer sample order'});assert.equal((await h.call('/snapshot',{token:intake})).data.queue[0].stage,'INTAKE');
 await action(intake,'send_doctor',{doctor_note:'Corrected QA note'});await action(doctor,'doctor_approve',{note:'QA checked'});await action(insurance,'insurance_answer',{status:'Denied',medium:'Insurer portal',reference:'DENIED-QA',evidence:'Sample insurer asks for more evidence'});assert.equal((await h.call('/snapshot',{token:intake})).data.queue[0].stage,'INTAKE');
 const scheduler=await h.login('scheduler'),claims=await h.login('claims');await action(intake,'send_doctor',{doctor_note:'Updated sample evidence'});await action(doctor,'doctor_approve',{note:'Checked'});await action(insurance,'insurance_answer',{status:'Approved',medium:'Insurer portal',reference:'AUTH-RETRY',evidence:'Sample approval'});await action(scheduler,'book',{scheduled_at:new Date(Date.now()+86400000).toISOString(),location:'Sample room'});await action(doctor,'ready',{note:'Sample check'});await action(doctor,'finish_visit',{simulate_visit_day:true});await action(doctor,'finish_report',{report_text:'Fictional report'});await action(doctor,'share_report',{recipient:'Sample practice'});await action(claims,'submit_claim',{reference:'CLAIM-RETRY',amount:100});await action(claims,'payment_answer',{status:'Denied',reference:'DENIED-CLAIM',evidence:'Sample missing billing code'});assert.equal((await h.call('/snapshot',{token:claims})).data.queue[0].stage,'CLAIM_FOLLOWUP');await action(claims,'submit_claim',{reference:'CLAIM-CORRECTED',amount:100});assert.equal((await h.call('/snapshot',{token:claims})).data.queue[0].stage,'PAYMENT');
});
test('database compare-and-swap prevents lost updates from simultaneous sessions',async()=>{
 const h=harness(),repo=repository(h.DB);await repo.ensure('owner');const first=await repo.read(),second=await repo.read();first.state.revision++;second.state.revision++;
 first.state.roles.push({id:'first',name:'First role',permissions:['work.claims']});second.state.roles.push({id:'second',name:'Second role',permissions:['work.claims']});
 await repo.commit(first.state,0);await assert.rejects(repo.commit(second.state,0),/team updated/);const final=(await repo.read()).state;assert.equal(final.roles.some(r=>r.id==='first'),true);assert.equal(final.roles.some(r=>r.id==='second'),false);
});
