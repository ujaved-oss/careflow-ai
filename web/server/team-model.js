export const permissions = {
 'cases.all':'See every case and assign the team',
 'work.intake':'Create cases and manage intake',
 'work.insurance':'Record insurance answers',
 'work.schedule':'Book appointments',
 'work.clinical':'Review orders, visits and reports',
 'work.claims':'Submit claims and record payments',
 'work.close':'Review and close completed cases',
 'team.manage':'Manage accounts, roles and access',
};
export const stages = {
 INTAKE:{label:'Check the request',permission:'work.intake'},
 DOCTOR_REVIEW:{label:'Doctor checks the order',permission:'work.clinical'},
 INSURANCE:{label:'Check insurance',permission:'work.insurance'},
 SCHEDULING:{label:'Book the visit',permission:'work.schedule'},
 PREVISIT:{label:'Check before the visit',permission:'work.clinical'},
 VISIT:{label:'Complete the visit',permission:'work.clinical'},
 REPORT:{label:'Finish the report',permission:'work.clinical'},
 REPORT_SHARE:{label:'Share the report',permission:'work.clinical'},
 CLAIM:{label:'Submit the claim',permission:'work.claims'},
 PAYMENT:{label:'Follow up on payment',permission:'work.claims'},
 CLAIM_FOLLOWUP:{label:'Resolve the denied claim',permission:'work.claims'},
 CLOSURE:{label:'Check and close',permission:'work.close'},
 CLOSED:{label:'Case closed',permission:null},
 CANCELLED:{label:'Case cancelled',permission:null},
};
export class Problem extends Error {constructor(message,status=400){super(message);this.status=status;}}
export function initialState(){
 const roles=[
  {id:'admin',name:'Admin',permissions:['cases.all','work.intake','work.close','team.manage'],system:true},
  {id:'intake',name:'Intake coordinator',permissions:['work.intake','work.close'],system:true},
  {id:'insurance',name:'Insurance coordinator',permissions:['work.insurance'],system:true},
  {id:'scheduler',name:'Scheduling coordinator',permissions:['work.schedule'],system:true},
  {id:'doctor',name:'Doctor',permissions:['work.clinical'],system:true},
  {id:'claims',name:'Claims coordinator',permissions:['work.claims'],system:true},
 ];
 const profiles=[['admin','Alex Morgan','admin'],['intake','Sam Rivera','intake'],['insurance','Noor Ali','insurance'],['scheduler','Taylor Reed','scheduler'],['doctor','Dr. Eliza Ward','doctor'],['claims','Jamie Chen','claims']];
 return {roles,users:profiles.map(([id,name,role_id])=>({id,name,email:`${id}@careflow-demo.invalid`,role_id,active:true,kind:'demo'})),cases:[],events:[],receipts:[],revision:0};
}
export function capabilities(state,user){return state.roles.find(r=>r.id===user.role_id)?.permissions||[];}
export function has(state,user,permission){return !!user?.active&&capabilities(state,user).includes(permission);}
export function publicUser(state,user){return {...user,role_name:state.roles.find(r=>r.id===user.role_id)?.name||'Role unavailable',permissions:capabilities(state,user)};}
function requirePermission(s,u,p){if(!has(s,u,p))throw new Problem('Your account does not have permission for this action.',403);}
function text(value,label,max=500){const s=String(value||'').trim();if(!s||s.length>max)throw new Problem(`Enter ${label} (up to ${max} characters).`);return s;}
function choice(value,options,label){if(!options.includes(value))throw new Problem(`Choose a valid ${label}.`);return value;}
function reviewed(body){if(body.reviewed!==true)throw new Problem('Check the details and tick the review box first.');}
function defaultAssignee(s,p){return s.users.find(u=>u.active&&has(s,u,p))?.id;}
function assign(s,c,stage){c.stage=stage;const p=stages[stage].permission;if(!p){c.owner_id=null;return;}let id=c.assignments[p],u=s.users.find(u=>u.id===id);if(!u?.active||!has(s,u,p)){id=defaultAssignee(s,p);c.assignments[p]=id;}if(!id)throw new Problem('Assign an active team member with the required access first.');c.owner_id=id;}
function audit(s,u,c,event,note,at,details={}){s.events.push({id:crypto.randomUUID(),case_id:c?.id||null,actor_id:u.id,actor_name:u.name,event,note,created_at:at,...details});}
export function canSee(s,u,c){if(c.archived)return has(s,u,'team.manage');return has(s,u,'cases.all')||Object.values(c.assignments).includes(u.id)||c.participants.includes(u.id);}
export function caseView(s,u,c){
 const copy=structuredClone(c);
 const readInsurance=['work.insurance','work.intake','work.clinical','cases.all'].some(p=>has(s,u,p));
 const readCorrection=['work.intake','work.clinical','work.insurance','cases.all'].some(p=>has(s,u,p));
 if(copy.stage==='INTAKE'&&!copy.correction&&readCorrection){if(['Denied','More information'].includes(copy.insurance_status)&&copy.insurance_evidence)copy.correction={kind:'insurance',reason:copy.insurance_evidence};else if(copy.doctor_status==='Needs more information'&&copy.blocker)copy.correction={kind:'doctor',reason:copy.blocker};}
 if(copy.doctor_status==='Ready for the visit'){copy.doctor_status='Checked';copy.visit_status=copy.appointment?.status==='Completed'?'Completed':'Ready for the visit';}
 if(copy.appointment?.status==='Completed')copy.visit_status='Completed';
 if(!has(s,u,'work.clinical')){delete copy.report_text;delete copy.previsit_note;}
 if(!has(s,u,'work.clinical')&&!has(s,u,'work.insurance')){if(!has(s,u,'work.intake'))delete copy.doctor_note;delete copy.doctor_review_note;}
 if(!has(s,u,'work.claims')){delete copy.claim_amount;delete copy.payment_evidence;delete copy.claim_responses;}
 if(!readInsurance){delete copy.insurance_evidence;delete copy.insurance_responses;if(/^Insurance:/.test(copy.blocker||''))copy.blocker=`Insurance: ${copy.insurance_status}. Intake is checking the next step.`;}
 if(!readCorrection){delete copy.correction;if(copy.doctor_status==='Needs more information')copy.blocker='The doctor asked intake to correct the request.';}
 if(!has(s,u,'work.intake')&&!has(s,u,'cases.all'))delete copy.cancellation_reason;
 copy.assignment_names=Object.fromEntries(Object.entries(copy.assignments).map(([p,id])=>[p,s.users.find(x=>x.id===id)?.name||'Assigned team member']));
 copy.owner_name=s.users.find(x=>x.id===c.owner_id)?.name||'Finished';copy.stage_label=stages[c.stage].label;
 copy.can_act=c.owner_id===u.id&&!!stages[c.stage].permission&&has(s,u,stages[c.stage].permission);
 copy.history=s.events.filter(e=>e.case_id===c.id).map(e=>{
  const h={...e};if(h.evidence_scope&&!has(s,u,h.evidence_scope))delete h.evidence;if(h.evidence_permissions&&!h.evidence_permissions.some(p=>has(s,u,p)))delete h.evidence;if(['Doctor checked the order','Report finished'].includes(e.event)&&!has(s,u,'work.clinical')&&!has(s,u,'work.insurance'))h.note='Recorded by the doctor.';if(e.event==='Returned to intake'&&!readCorrection)h.note='The doctor asked intake to correct the request.';return h;
 });
 return copy;
}
export function view(s,u){
 const cases=s.cases.filter(c=>!c.archived&&canSee(s,u,c)).map(c=>caseView(s,u,c));
 return {revision:s.revision,user:publicUser(s,u),cases,queue:cases.filter(c=>c.owner_id===u.id),directory:s.users.filter(x=>x.active).map(x=>({id:x.id,name:x.name,role_name:s.roles.find(r=>r.id===x.role_id)?.name,permissions:capabilities(s,x)})),stages,permissions};
}
export function mutate(original,actorId,path,body,at=new Date().toISOString()){
 const s=structuredClone(original),u=s.users.find(x=>x.id===actorId&&x.active);
 if(!u)throw new Problem('This account is disabled. Ask your admin.',403);
 const operation=text(body.operation_id,'an operation reference',100);
 const previous=s.receipts.find(r=>r.id===operation&&r.actor===u.id);
 if(previous){if(previous.path!==path||previous.body!==JSON.stringify(body))throw new Problem('This operation reference was used for different details.',409);return {state:original,result:previous.result,replayed:true};}
 let result;
 if(path==='/demo/reset'){
  requirePermission(s,u,'team.manage');
  if(body.expected_revision!==s.revision)throw new Problem('The team changed. Check the latest preflight before starting fresh.',409);
  let count=0;for(const c of s.cases.filter(c=>c.demo_tour&&!c.archived)){c.archived=true;c.version++;c.updated_at=at;audit(s,u,c,'Case archived','Previous guided tour archived. Admin can restore it.',at);count++;}
  result={archived:count};
 }else if(path==='/cases'){
  requirePermission(s,u,'work.intake');reviewed(body);
  const patient_name=text(body.patient_name,'a fictional patient name',80),external_reference=text(body.external_reference,'a sample referral reference',100);
  if(!external_reference.startsWith('SYN-'))throw new Problem('Use a SYN- reference for this sample case.');
  if(s.cases.some(c=>c.external_reference===external_reference))throw new Problem('That referral is already registered. Open the existing case.',409);
  const c={id:crypto.randomUUID(),case_number:`CF-${String(s.cases.length+1041)}`,patient_name,external_reference,source:choice(body.source,['email','paper','ehr','desk'],'request source'),procedure:text(body.procedure,'the ordered test',80),order_note:text(body.order_note,'the sample request',1000),doctor_note:String(body.doctor_note||'').trim().slice(0,1000),created_at:at,created_by:u.id,version:1,stage:'INTAKE',participants:[u.id],assignments:{},insurance_status:'Waiting',doctor_status:'Not reviewed',appointment:null,report_status:'Not started',claim_status:'Not started',blocker:''};
  for(const p of Object.keys(permissions).filter(p=>p.startsWith('work.'))){const selected=body.assignments?.[p]||defaultAssignee(s,p);const target=s.users.find(x=>x.id===selected&&x.active);if(!target||!has(s,target,p))throw new Problem(`Choose a team member for ${permissions[p].toLowerCase()}.`);c.assignments[p]=selected;}
  c.demo_tour=body.demo_tour===true;
  c.source_record={label:'Manually registered fictional request',body:c.order_note,patient_name:c.patient_name,procedure:c.procedure,reference:external_reference,registered_by:u.name,registered_at:at};
  c.assignments['work.intake']=body.assignments?.['work.intake']||(has(s,u,'cases.all')?s.users.find(x=>x.active&&has(s,x,'work.intake')&&!has(s,x,'cases.all'))?.id||u.id:u.id);assign(s,c,'INTAKE');s.cases.push(c);audit(s,u,c,'Case created',`${c.source} request registered by a person. No inbox or hospital feed is connected.`,at);result={case_id:c.id};
 }else if(path==='/accounts'){
  requirePermission(s,u,'team.manage');const email=text(body.email,'an account email',200).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Problem('Enter a valid email address.');if(s.users.some(x=>x.email===email))throw new Problem('This email already has an account.');
  const role_id=choice(body.role_id,s.roles.map(r=>r.id),'role');const account={id:crypto.randomUUID(),name:text(body.name,'the team member name',80),email,role_id,active:true,kind:'staff'};s.users.push(account);audit(s,u,null,'Account created',`${account.name} · ${s.roles.find(r=>r.id===role_id).name}`,at);result={account_id:account.id};
 }else if(/^\/accounts\//.test(path)){
  requirePermission(s,u,'team.manage');const target=s.users.find(x=>x.id===path.split('/')[2]);if(!target)throw new Problem('Account not found.',404);if(target.id==='admin')throw new Problem('The workspace owner admin profile is protected.');
  if(body.role_id!==undefined){choice(body.role_id,s.roles.map(r=>r.id),'role');target.role_id=body.role_id;}
  if(body.active!==undefined){if(typeof body.active!=='boolean')throw new Problem('Choose active or disabled.');target.active=body.active;}
  if(body.name!==undefined)target.name=text(body.name,'the name',80);
  if(!target.active||body.role_id!==undefined){for(const c of s.cases.filter(c=>c.stage!=='CLOSED')){const p=stages[c.stage].permission;if(c.owner_id===target.id&&(!target.active||!has(s,target,p))){assign(s,c,c.stage);c.version++;audit(s,u,c,'Owner changed',`Assigned to ${s.users.find(x=>x.id===c.owner_id).name} after access changed.`,at);}}}
  audit(s,u,null,'Account access updated',target.name,at);result={account_id:target.id};
 }else if(path==='/roles'){
  requirePermission(s,u,'team.manage');const selected=body.permissions;if(!Array.isArray(selected)||!selected.length||selected.some(p=>!Object.keys(permissions).includes(p)))throw new Problem('Choose at least one supported permission.');const name=text(body.name,'a role name',60);if(s.roles.some(r=>r.name.toLowerCase()===name.toLowerCase()))throw new Problem('This role name already exists.');const role={id:crypto.randomUUID(),name,permissions:[...new Set(selected)],system:false};s.roles.push(role);audit(s,u,null,'Role created',role.name,at);result={role_id:role.id};
 }else if(/^\/cases\/[^/]+\/action$/.test(path)){
  const c=s.cases.find(x=>x.id===path.split('/')[2]);if(!c||!canSee(s,u,c))throw new Problem('Case not found.',404);
  if(body.expected_version!==c.version)throw new Problem('Someone updated this case. Review the latest details before saving.',409);
  const action=body.action;
  if(['archive','restore'].includes(action)){
   requirePermission(s,u,'team.manage');const archived=action==='archive';if(!!c.archived===archived)throw new Problem('This case is already in that state.',409);c.archived=archived;if(!archived&&c.stage!=='CLOSED')assign(s,c,c.stage);audit(s,u,c,archived?'Case archived':'Case restored',archived?'Removed from staff queues. Admin can restore it.':'Returned to the shared workspace.',at);
  }else if(c.archived){throw new Problem('Restore this case before changing it.',409);
  }else if(action==='reassign'){
   requirePermission(s,u,'cases.all');if(['CLOSED','CANCELLED'].includes(c.stage))throw new Problem('This case is finished.');const p=stages[c.stage].permission,target=s.users.find(x=>x.id===body.owner_id&&x.active);if(!target||!has(s,target,p))throw new Problem('Choose an active person with access to this step.');c.assignments[p]=target.id;c.owner_id=target.id;audit(s,u,c,'Owner changed',`Assigned to ${target.name}.`,at);
  }else if(action==='edit_request'){
   reviewed(body);if(c.appointment||!['INTAKE','DOCTOR_REVIEW','INSURANCE','SCHEDULING'].includes(c.stage))throw new Problem('Correct the request before booking a visit.');
   if(!has(s,u,'cases.all')&&!(has(s,u,'work.intake')&&c.assignments['work.intake']===u.id))throw new Problem('The assigned intake person or admin corrects this request.',403);
   if(c.source_record){c.source_record.patient_name??=c.patient_name;c.source_record.procedure??=c.procedure;}
   c.patient_name=text(body.patient_name,'a fictional patient name',80);c.procedure=choice(body.procedure,['MRI brain','MRI knee','MRI spine'],'ordered test');c.order_note=text(body.order_note,'the sample request',1000);c.doctor_note=text(body.doctor_note,'the sample supporting note',1000);
   c.doctor_status='Not reviewed';c.insurance_status='Waiting';c.blocker='';delete c.correction;delete c.doctor_review_note;delete c.insurance_reference;delete c.insurance_evidence;delete c.insurance_source;assign(s,c,'INTAKE');audit(s,u,c,'Request corrected','Current request updated. The original source stays saved. Doctor and insurance checks must be repeated.',at);
  }else if(['reschedule','cancel_appointment'].includes(action)){
   reviewed(body);requirePermission(s,u,'work.schedule');if(c.assignments['work.schedule']!==u.id)throw new Problem('The assigned scheduling person manages this booking.',403);
   if(!c.appointment||c.appointment.status!=='Booked'||!['PREVISIT','VISIT'].includes(c.stage))throw new Problem('Only a booked visit that has not happened can be changed.');
   const reason=text(body.reason,'why this booking is changing',500);(c.appointment_history??=[]).push({...c.appointment,changed_at:at,change:action});
   if(action==='reschedule'){const scheduled_at=text(body.scheduled_at,'the new appointment time',60);if(!Number.isFinite(Date.parse(scheduled_at))||Date.parse(scheduled_at)<=Date.parse(at))throw new Problem('Choose a future appointment time.');c.appointment.scheduled_at=scheduled_at;c.appointment.location=text(body.location,'the visit location',100);assign(s,c,'PREVISIT');audit(s,u,c,'Appointment rescheduled',reason,at,{appointment_time:scheduled_at,appointment_location:c.appointment.location});}
   else{c.appointment=null;assign(s,c,'SCHEDULING');audit(s,u,c,'Appointment cancelled',reason,at);}
   c.visit_status='Not completed';delete c.previsit_note;c.blocker='';
  }else if(action==='cancel_case'){
   reviewed(body);requirePermission(s,u,'cases.all');if(!['INTAKE','DOCTOR_REVIEW','INSURANCE','SCHEDULING','PREVISIT','VISIT'].includes(c.stage)||c.appointment?.status==='Completed')throw new Problem('Only a case before its completed visit can be cancelled.');
   c.cancellation_reason=text(body.reason,'why the case is cancelled',500);if(c.appointment)c.appointment.status='Cancelled';c.blocker='';delete c.correction;assign(s,c,'CANCELLED');audit(s,u,c,'Case cancelled','Work stopped before the visit. The saved history is kept.',at,{evidence:c.cancellation_reason,evidence_scope:'work.intake'});
  }else{
   const permission=stages[c.stage].permission;if(!permission||c.owner_id!==u.id)throw new Problem('This step belongs to another team member.',403);requirePermission(s,u,permission);reviewed(body);
   const allowed={INTAKE:['send_doctor'],DOCTOR_REVIEW:['doctor_approve','doctor_return'],INSURANCE:['insurance_answer'],SCHEDULING:['book'],PREVISIT:['ready'],VISIT:['finish_visit'],REPORT:['finish_report'],REPORT_SHARE:['share_report'],CLAIM:['submit_claim'],PAYMENT:['payment_answer'],CLAIM_FOLLOWUP:['submit_claim'],CLOSURE:['close']};if(!allowed[c.stage]?.includes(action))throw new Problem('This action does not match the current step.',409);
   if(action==='send_doctor'){
    c.doctor_note=text(body.doctor_note||c.doctor_note,'the sample supporting note',1000);c.blocker='';delete c.correction;c.doctor_status='Waiting for review';assign(s,c,'DOCTOR_REVIEW');audit(s,u,c,'Sent to the doctor','Order and supporting note ready to check.',at);
   }else if(action==='doctor_approve'){
    c.doctor_review_note=text(body.note,'the doctor review note',1000);c.doctor_status='Checked';c.blocker='';assign(s,c,'INSURANCE');audit(s,u,c,'Doctor checked the order',c.doctor_review_note,at);
   }else if(action==='doctor_return'){
    const reason=text(body.note,'what intake needs to fix',500);c.correction={kind:'doctor',reason};c.blocker='The doctor asked intake to correct the request.';c.doctor_status='Needs more information';assign(s,c,'INTAKE');audit(s,u,c,'Returned to intake','The doctor asked intake to correct the request.',at,{evidence:reason,evidence_permissions:['work.intake','work.clinical','work.insurance','cases.all']});
   }else if(action==='insurance_answer'){
    c.insurance_status=choice(body.status,['Pending','Approved','Denied','More information'],'insurance answer');c.insurance_source=choice(body.medium,['Insurer portal','Email / letter','Phone confirmation'],'answer source');c.insurance_reference=text(body.reference,'the insurer reference',120);c.insurance_evidence=text(body.evidence,'the insurer response or evidence reference',1000);c.insurance_updated_at=at;
    (c.insurance_responses??=[]).push({status:c.insurance_status,medium:c.insurance_source,reference:c.insurance_reference,evidence:c.insurance_evidence,actor:u.name,at});
    if(c.insurance_status==='Approved'){c.blocker='';delete c.correction;assign(s,c,'SCHEDULING');}else if(['Denied','More information'].includes(c.insurance_status)){c.blocker=`Insurance: ${c.insurance_status}. Intake is checking the next step.`;c.correction={kind:'insurance',reason:c.insurance_evidence};assign(s,c,'INTAKE');}else{c.blocker='Waiting for an insurer answer. The insurance coordinator follows up outside CareFlow.';}
    audit(s,u,c,'Insurance answer recorded',`${c.insurance_status} · ${c.insurance_source} · ${c.insurance_reference}`,at,{evidence:c.insurance_evidence,evidence_scope:'work.insurance'});
   }else if(action==='book'){
    if(c.appointment||c.insurance_status!=='Approved'||c.doctor_status!=='Checked')throw new Problem('Booking needs checked orders, approved insurance and no existing appointment.');
    const scheduled_at=text(body.scheduled_at,'the appointment time',60);if(!Number.isFinite(Date.parse(scheduled_at))||Date.parse(scheduled_at)<=Date.parse(at))throw new Problem('Choose a future appointment time.');c.appointment={id:crypto.randomUUID(),scheduled_at,location:text(body.location,'the visit location',100),status:'Booked',booked_by:u.id};assign(s,c,'PREVISIT');audit(s,u,c,'Appointment booked',c.appointment.location,at,{appointment_time:scheduled_at,appointment_location:c.appointment.location});
   }else if(action==='ready'){
    c.previsit_note=text(body.note,'the sample before-visit check',500);c.doctor_status='Checked';c.visit_status='Ready for the visit';assign(s,c,'VISIT');audit(s,u,c,'Before-visit check complete','Recorded by the doctor.',at);
   }else if(action==='finish_visit'){
    if(Date.parse(c.appointment.scheduled_at)>Date.parse(at)&&body.simulate_visit_day!==true)throw new Problem('This appointment is in the future. Tick the demo time-jump box to simulate visit day.');
    c.simulated_visit_day=body.simulate_visit_day===true;c.visit_status='Completed';c.doctor_status='Checked';c.appointment.status='Completed';assign(s,c,'REPORT');audit(s,u,c,'Visit completed',c.simulated_visit_day?'Visit day simulated. Report is still needed.':'Report is still needed.',at);
   }else if(action==='finish_report'){
    c.report_text=text(body.report_text,'the fictional report',2000);c.report_status='Final';assign(s,c,'REPORT_SHARE');audit(s,u,c,'Report finished','Sample report checked by the doctor.',at);
   }else if(action==='share_report'){
    c.report_recipient=text(body.recipient,'the sample report recipient',150);c.report_status='Shared';assign(s,c,'CLAIM');audit(s,u,c,'Report shared',`Recorded sample handoff to ${c.report_recipient}. No email sent.`,at);
   }else if(action==='submit_claim'){
    if(c.report_status!=='Shared')throw new Problem('Finish and share the report before billing.');
    // Older clients may omit a correction. Supplied corrections are retained as
    // claims-only history evidence, so a later payer answer cannot overwrite them.
    let correctionNote;
    if(body.correction_note!==undefined){
     if(c.stage!=='CLAIM_FOLLOWUP')throw new Problem('A correction note belongs to a denied-claim resubmission.');
     if(typeof body.correction_note!=='string')throw new Problem('Enter the verified claim correction as text.');
     correctionNote=text(body.correction_note,'the verified claim correction',1000);
    }
    c.claim_reference=text(body.reference,'the claim reference',120);const amount=Number(body.amount);if(!Number.isFinite(amount)||amount<=0||amount>1e7)throw new Problem('Enter a positive sample claim amount.');c.claim_amount=amount;c.claim_currency=choice(body.currency||'USD',['USD','AED','PKR','SAR','GBP','EUR'],'currency');c.claim_status='Submitted';c.blocker='';assign(s,c,'PAYMENT');audit(s,u,c,'Claim submitted',`Sample claim ${c.claim_reference}. No external submission.`,at,correctionNote?{evidence:correctionNote,evidence_scope:'work.claims'}:{});
   }else if(action==='payment_answer'){
    c.claim_status=choice(body.status,['Pending','Paid','Denied'],'claim answer');c.payment_reference=text(body.reference,'the payment or claim response reference',120);c.payment_evidence=text(body.evidence,'the sample payer response',1000);
    (c.claim_responses??=[]).push({status:c.claim_status,reference:c.payment_reference,evidence:c.payment_evidence,claim_reference:c.claim_reference,amount:c.claim_amount,currency:c.claim_currency,actor:u.name,at});
    if(c.claim_status==='Paid'){c.blocker='';assign(s,c,'CLOSURE');}else if(c.claim_status==='Denied'){c.blocker='Claim denied. Claims has the response and next step.';assign(s,c,'CLAIM_FOLLOWUP');}audit(s,u,c,'Claim answer recorded',`${c.claim_status} · ${c.payment_reference}`,at,{evidence:c.payment_evidence,evidence_scope:'work.claims'});
   }else if(action==='close'){
    if(c.report_status!=='Shared'||c.claim_status!=='Paid'||c.appointment?.status!=='Completed')throw new Problem('The visit, shared report and payment must all be complete.');assign(s,c,'CLOSED');audit(s,u,c,'Case closed','All required work checked.',at);
   }
  }
  c.version++;c.updated_at=at;if(!c.participants.includes(u.id))c.participants.push(u.id);result={case_id:c.id};
 }else throw new Problem('Action not found.',404);
 s.revision=original.revision+1;s.receipts.push({id:operation,actor:u.id,path,body:JSON.stringify(body),result});s.receipts=s.receipts.slice(-500);return {state:s,result};
}
