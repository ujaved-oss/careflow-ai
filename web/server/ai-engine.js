import {aiCapabilities,AI_CONTRACT_VERSION} from '../shared/ai-capabilities.js';

// This adapter deliberately performs deterministic demonstration work only.
// A future provider implements run({capability,caseRecord,documents,question,at})
// and returns this same evidence-linked, review-only contract. No network calls.
export const mockProvider={id:'simulation',version:'1.0',run:runDemo};
export function validateAgentResult(out,{capability,documents,caseRecord}){
 if(!out||out.contract_version!==AI_CONTRACT_VERSION||out.capability!==capability||typeof out.summary!=='string'||typeof out.title!=='string'||!['review','abstain'].includes(out.decision)||!['fields','checks','evidence'].every(k=>Array.isArray(out[k])&&out[k].length<=100)||!(out.draft===null||typeof out.draft==='string'))throw new Error('Invalid agent result contract.');
 for(const e of out.evidence){if(typeof e.quote!=='string'||typeof e.source_id!=='string')throw new Error('Invalid agent source.');const d=documents.find(d=>d.id===e.source_id);if(d){if(!lines(d).some(l=>l.line===e.line&&l.quote===e.quote))throw new Error('Agent quote does not match the permitted paper.');}
  else if(e.source_id.startsWith(`case:${caseRecord?.id}:`)){const field=e.source_id.slice(`case:${caseRecord.id}:`.length);if(!Object.hasOwn(caseRecord,field)&&!['updated_at','blocker','appointment'].includes(field))throw new Error('Agent source is outside the permitted case fields.');}
  else if(e.source_id.startsWith('event:')){if(!caseRecord?.history?.some(h=>`event:${h.id}`===e.source_id&&e.quote===`${h.event}: ${h.note}`))throw new Error('Agent event source is unavailable.');}
  else throw new Error('Agent source is unavailable.');
 }
 return out;
}
const clean=s=>String(s||'').trim();
const key=s=>clean(s).toLowerCase().replace(/[^a-z0-9]/g,'');
export function lines(doc){return doc.text.split(/\r?\n/).map((text,i)=>({source_id:doc.id,label:doc.name,line:i+1,quote:text.trim()})).filter(x=>x.quote);}
export function value(doc,labels){const wanted=labels.map(key);return lines(doc).find(l=>{const colon=l.quote.indexOf(':');return colon>=0&&wanted.includes(key(l.quote.slice(0,colon)));});}
const tail=l=>l?l.quote.slice(l.quote.indexOf(':')+1).trim():'';
export function documentKind(doc){
 const t=doc.text.toLowerCase();
 if(/document type:\s*clinical note/.test(t))return 'clinical';
 if(/document type:\s*(claim denial|payment notice)/.test(t))return 'billing';
 if(/document type:\s*(authorization reply|insurance letter)/.test(t))return 'insurance';
 if(/document type:\s*(payer policy|plan policy)/.test(t))return 'policy';
 if(/document type:\s*(radiology report|clinical report)/.test(t))return 'report';
 if(/document type:\s*(referral|signed order)/.test(t)||/requested (test|procedure):/.test(t))return 'referral';
 return 'unknown';
}
export const documentScopes={referral:['work.intake','work.clinical','work.insurance','work.schedule','work.claims','work.close','cases.all'],clinical:['work.intake','work.clinical','work.insurance'],insurance:['work.intake','work.insurance','work.clinical'],policy:['work.insurance'],billing:['work.claims'],report:['work.clinical'],unknown:[]};
function recordEvidence(c,field,label){return {source_id:`case:${c.id}:${field}`,label:'Saved case record',line:null,quote:`${label}: ${c[field]??'Not recorded'}`};}
function completeness(c,docs){
 const checks=[],evidence=[];
 const check=(label,found,proof)=>{checks.push({label,status:found?'found':'missing',detail:found?'Found in the saved evidence.':'Not found in the documents you can read.'});if(found&&proof)evidence.push(proof);};
 const matchesPatient=d=>key(tail(value(d,['Patient','Patient name'])))===key(c.patient_name);
 const referral=docs.find(d=>d.kind==='referral'&&matchesPatient(d)),support=docs.find(d=>d.kind==='clinical'&&matchesPatient(d));
 for(const [label,labels] of [['Patient name',['Patient','Patient name']],['Referral reference',['Referral reference','Reference']],['Requested test',['Requested test','Procedure']],['Referring practice',['Referring practice','Referring provider']]]){const l=referral&&value(referral,labels);check(label,!!tail(l),l);}
 const signed=referral&&value(referral,['Signed']);check('Signed order',/^yes\b/i.test(tail(signed)),signed);
 const clinical=support&&value(support,['Supporting note','Clinical note']);check('Supporting note',!!tail(clinical),clinical);
 for(const d of docs){const patient=value(d,['Patient','Patient name']);if(patient&&key(tail(patient))!==key(c.patient_name)){checks.push({label:'Patient name mismatch',status:'conflict',detail:`${d.name} names a different patient. Do not use it until checked.`});evidence.push(patient);}}
 return {checks,evidence};
}
function runDemo({capability,caseRecord:c,documents:docs=[],question='',at=new Date().toISOString()}){
 const cap=aiCapabilities.find(x=>x.id===capability);if(!cap)throw new Error('Unsupported demo capability');
 const out={contract_version:AI_CONTRACT_VERSION,provider:'simulation',provider_version:'1.0',capability,title:cap.name,summary:'',fields:[],checks:[],evidence:[],draft:null,decision:'review',created_at:at};
 const field=(name,v,proof)=>{out.fields.push({name,value:v||'',status:v?'found':'missing'});if(v&&proof)out.evidence.push(proof);};
 const caseFact=(field,label)=>{const e=recordEvidence(c,field,label);out.evidence.push(e);return c[field];};
 if(capability==='intake'){
  const d=docs.find(d=>d.kind==='referral')||docs[0];
  for(const [name,labels] of [['patient_name',['Patient','Patient name']],['external_reference',['Referral reference','Reference']],['procedure',['Requested test','Procedure']],['order_note',['Request','Order note']]]){const l=d&&value(d,labels);field(name,tail(l),l);}
  const p=out.fields.find(f=>f.name==='procedure');if(p.value&&!['MRI brain','MRI knee','MRI spine'].includes(p.value)){p.status='unsupported';out.checks.push({label:'Requested test',status:'conflict',detail:'This demo supports MRI brain, knee and spine only. Do not replace another test with an MRI.'});}
  out.summary='Prepared from labeled fictional referral text. Check each value before creating the case. Blank fields were not supplied.';
 }else if(capability==='classify'){
  for(const d of docs){const type=lines(d).find(l=>/^Document type:/i.test(l.quote));out.checks.push({label:d.name,status:d.kind==='unknown'?'missing':'found',detail:`Suggested type: ${d.kind}. ${d.kind==='unknown'?'Choose a type yourself after review.':'Review the label before accepting it.'}`});if(type)out.evidence.push(type);const patient=value(d,['Patient','Patient name']);if(patient){out.evidence.push(patient);if(key(tail(patient))!==key(c.patient_name))out.checks.push({label:'Patient mismatch',status:'conflict',detail:`${d.name} belongs to another name. Check before filing.`});}}
  out.summary=docs.length?'The demo sorts labeled papers. Source access does not change when you run this check.':'Add a fictional document first.';
 }else if(['completeness','request'].includes(capability)){
  Object.assign(out,completeness(c,docs));const missing=out.checks.filter(x=>x.status!=='found');out.summary=missing.length?`${missing.length} item${missing.length===1?' needs':'s need'} attention.`:'All items in the sample intake checklist were found. A clinician still reviews the order.';
  if(capability==='request'){const referral=docs.find(d=>d.kind==='referral'),recipient=referral&&value(referral,['Referring practice']);if(recipient)out.evidence.push(recipient);out.draft=missing.length?`To: ${tail(recipient)||'[Choose the referring practice]'}\nSubject: Missing information for ${c.external_reference}\n\nPlease help complete ${c.patient_name}'s ${c.procedure} request.\n${missing.map(x=>`- ${x.label}: ${x.detail}`).join('\n')}\nPlease include the referral reference with your reply.\n\nDraft only. Review the recipient before sending outside CareFlow.`:'No missing-information request is needed for the sample checklist.';}
 }else if(capability==='authorization'){
  const policy=docs.find(d=>d.kind==='policy'),parts=policy?lines(policy):[];const requirement=parts.filter(l=>/^Requires:/i.test(l.quote));
  const payer=policy&&value(policy,['Payer']),plan=policy&&value(policy,['Plan']),procedure=policy&&value(policy,['Procedure']),from=policy&&value(policy,['Effective from']),until=policy&&value(policy,['Effective until']);
  const valid=!!payer&&!!plan&&tail(procedure)===c.procedure&&/^\d{4}-\d{2}-\d{2}$/.test(tail(from))&&/^\d{4}-\d{2}-\d{2}$/.test(tail(until))&&Date.parse(tail(from))<=Date.parse(at)&&Date.parse(tail(until))+86400000>Date.parse(at);
  out.checks.push({label:'Sample policy match',status:valid?'found':'missing',detail:valid?'Procedure and effective dates match. Verify that this payer and plan belong to the patient.':'Add a sample policy with payer, plan, matching procedure and current effective dates.'});
  if(policy){out.evidence.push(...[payer,plan,procedure,from,until].filter(Boolean));}
  for(const r of requirement){out.evidence.push(r);const name=tail(r);let proof;
   const patientDocs=docs.filter(d=>key(tail(value(d,['Patient','Patient name'])))===key(c.patient_name));
   if(/signed order/i.test(name))proof=patientDocs.filter(d=>d.kind==='referral').map(d=>value(d,['Signed'])).find(l=>/^yes\b/i.test(tail(l)));
   else if(/supporting note/i.test(name))proof=patientDocs.filter(d=>d.kind==='clinical').map(d=>value(d,['Supporting note','Clinical note'])).find(l=>!!tail(l));
   out.checks.push({label:name,status:proof?'found':'missing',detail:proof?'Evidence located. Coordinator must check that it meets the actual requirement.':'No matching evidence found. Do not invent it.'});if(proof)out.evidence.push(proof);
  }
  if(!requirement.length)out.checks.push({label:'Policy requirements',status:'missing',detail:'No requirements were listed in the sample policy.'});
  const conflict=completeness(c,docs).checks.filter(x=>x.status==='conflict');out.checks.push(...conflict);
  out.summary=valid?'Sample evidence packet prepared for coordinator review. This is not an insurer approval.':'A matching sample policy is needed before preparing a complete packet.';
  out.draft=`PRIOR-AUTHORIZATION DRAFT\nCase: ${c.external_reference}\nPatient: ${c.patient_name}\nRequested test: ${c.procedure}\nPayer: ${tail(payer)||'Not supplied'}\nPlan: ${tail(plan)||'Not supplied'}\n\n${out.checks.map(x=>`${x.status.toUpperCase()}: ${x.label}. ${x.detail}`).join('\n')}\n\nEvidence attached in the source list. Verify patient plan, dates and clinical evidence before submission. No external submission was made.`;
 }else if(capability==='response'){
  const d=[...docs].reverse().find(d=>d.kind==='insurance');const l=d&&value(d,['Decision']),reference=d&&value(d,['Authorization reference','Reference']);const decision=tail(l),known=['Approved','Denied','More information','Pending'].includes(decision);
  field('status',known?decision:'',l);field('reference',tail(reference),reference);field('medium',d?'Email / letter':'',d&&lines(d)[0]);const reason=d&&value(d,['Reason','Evidence']);field('evidence',tail(reason),reason);const expires=d&&value(d,['Valid until']);if(expires)field('valid_until',tail(expires),expires);
  const patient=d&&value(d,['Patient']);if(patient){out.evidence.push(patient);if(key(tail(patient))!==key(c.patient_name))out.checks.push({label:'Wrong patient',status:'conflict',detail:'This reply names someone else. Do not apply it.'});}
  else out.checks.push({label:'Patient identity missing',status:'conflict',detail:'The sample letter needs a Patient line before its answer can fill this case.'});
  const ref=d&&value(d,['Referral reference']);if(ref){out.evidence.push(ref);if(tail(ref)!==c.external_reference)out.checks.push({label:'Wrong referral',status:'conflict',detail:'The reply reference does not match this case.'});}
  else out.checks.push({label:'Referral reference missing',status:'conflict',detail:'The sample letter needs its referral reference before filling this case.'});
  if(expires&&(!/^\d{4}-\d{2}-\d{2}$/.test(tail(expires))||!Number.isFinite(Date.parse(tail(expires)))||Date.parse(tail(expires))+86400000<=Date.parse(at)))out.checks.push({label:'Approval date',status:'conflict',detail:'This approval date is invalid or has expired. Ask the coordinator to check it.'});
  out.summary=known?'The sample letter states this answer. Review it, then fill the insurance form. This does not decide coverage.':'No clear supported insurer decision was found. Check the letter yourself.';
 }else if(capability==='handoff'){
  const stage=caseFact('stage_label','Current step')||c.stage,owner=caseFact('owner_name','Next owner');caseFact('doctor_status','Order check');caseFact('insurance_status','Recorded insurance answer');caseFact('report_status','Report status');caseFact('claim_status','Claim status');if(c.blocker)caseFact('blocker','Current blocker');
  const latest=c.history?.filter(x=>!x.event.startsWith('Demo assistant')).at(-1);if(latest)out.evidence.push({source_id:`event:${latest.id}`,label:'Saved case history',line:null,quote:`${latest.event}: ${latest.note}`});
  out.summary=`${c.patient_name}: ${stage}. ${owner==='Finished'?'No next owner.':`${owner} has the next step.`} ${c.blocker||'No blocker is recorded.'}`;
  out.draft=`HANDOFF BRIEF\n${out.summary}\n${latest?`Latest saved action: ${latest.event}.\n`:''}Check the linked facts and your own task before taking action.`;
 }else if(capability==='ask'){
  const q=clean(question).toLowerCase();
  if(/\b(why|block|hold|waiting|next|owner|step)\b/.test(q)){const owner=caseFact('owner_name','Next owner'),stage=caseFact('stage_label','Current step');caseFact('blocker','Recorded blocker');out.summary=`Current step: ${stage}. ${owner} owns the next task. ${c.blocker||'No blocker is recorded.'}`;}
  else if(/\b(insurance|approv|authorization|insurer)/.test(q)){const status=caseFact('insurance_status','Recorded insurance answer');if(c.insurance_reference)caseFact('insurance_reference','Response reference');if(c.insurance_evidence)caseFact('insurance_evidence','Recorded evidence');out.summary=`Saved insurance answer: ${status}. This is the coordinator's recorded answer. The insurer makes the decision.`;}
  else if(/\b(report|result)\b/.test(q)&&c.report_text){caseFact('report_text','Saved report');out.summary=`Saved fictional report: ${c.report_text}`;}
  else if(/\b(appointment|booking|scheduled|visit time)\b/.test(q)){out.evidence.push({source_id:`case:${c.id}:appointment`,label:'Saved case record',line:null,quote:c.appointment?`Appointment: ${c.appointment.scheduled_at} / ${c.appointment.location} / ${c.appointment.status}`:'No appointment is recorded.'});out.summary=out.evidence[0].quote;}
  else if(/\b(payment|claim|paid|bill)\b/.test(q)){const status=caseFact('claim_status','Recorded claim status');if(c.payment_evidence)caseFact('payment_evidence','Recorded claim response');out.summary=`Saved claim status: ${status}. Only the recorded payer response establishes payment.`;}
  else{const tokens=q.match(/[a-z0-9]{3,}/g)?.filter(t=>!['what','does','this','that','have','about','with','from','please','tell','show','paper','document','patient','case'].includes(t))||[];const hits=docs.flatMap(lines).map(l=>({l,score:tokens.filter(t=>l.quote.toLowerCase().includes(t)).length})).filter(x=>x.score>=Math.min(2,tokens.length)&&tokens.length>0).sort((a,b)=>b.score-a.score).slice(0,3);if(hits.length){out.evidence=hits.map(x=>x.l);out.summary=`Saved text: ${hits[0].l.quote} This is a retrieved passage, not a medical recommendation.`;}else{out.summary='I cannot find that answer in the case or papers you can read. Ask the responsible person or add the missing evidence.';out.decision='abstain';}}
 }else if(capability==='denial'){
  const denied=c.claim_status==='Denied',reason=caseFact('payment_evidence','Saved payer response');caseFact('claim_status','Claim status');if(c.payment_reference)caseFact('payment_reference','Response reference');
  out.summary=denied&&reason?'A reply draft was prepared from the recorded denial. Billing must decide the correct correction or appeal.':'Record a denied claim and its actual reason before preparing a reply.';
  if(denied&&reason){const documents=docs.filter(d=>['referral','billing'].includes(d.kind));for(const d of documents)out.evidence.push(...lines(d).slice(0,2));out.draft=`CLAIM FOLLOW-UP DRAFT\nCase: ${c.external_reference}\nClaim: ${c.claim_reference}\nPayer response: ${c.payment_reference}\nRecorded reason: ${reason}\n\nPlease review the recorded reason and the supporting papers listed below.\n${documents.map(d=>`- ${d.name}`).join('\n')||'- No permitted supporting documents have been attached.'}\n\n[Billing team: enter the verified correction and confirm the required attachments.]\nNo billing code was changed. No appeal was sent.`;}
 }else if(capability==='followup'){
  const base=c.updated_at||c.created_at,days=Math.max(0,Math.floor((Date.parse(at)-Date.parse(base))/86400000));caseFact('updated_at','Last case change');caseFact('stage_label','Current step');caseFact('owner_name','Next owner');if(c.blocker)caseFact('blocker','Recorded blocker');
  out.checks=[{label:'Recent staff activity',status:days>=2?'missing':'found',detail:`${days} full days since the last saved case change. This is an administrative timer, not clinical triage.`},{label:'Visit completed',status:c.appointment?.status==='Completed'?'found':'missing',detail:c.appointment?.status||'No completed visit recorded.'},{label:'Report shared',status:c.report_status==='Shared'?'found':'missing',detail:c.report_status},{label:'Claim paid',status:c.claim_status==='Paid'?'found':'missing',detail:c.claim_status}];
  out.evidence.push({source_id:`case:${c.id}:appointment`,label:'Saved case record',line:null,quote:`Visit: ${c.appointment?.status||'Not booked'}`},recordEvidence(c,'report_status','Report'),recordEvidence(c,'claim_status','Claim'));
  const finished=['CLOSED','CANCELLED'].includes(c.stage);out.summary=finished?c.stage==='CLOSED'?'Case is closed. The saved finish checks are shown below.':'Case was cancelled. Do not count it as completed care.':days>=2?'This case has been quiet for at least two days. Review the next task.':'No overdue follow-up is flagged by the sample two-day rule.';
  if(!finished)out.draft=`FOLLOW-UP DRAFT\nTo: ${c.owner_name}\nCase: ${c.external_reference}\nCurrent task: ${c.stage_label}\n${c.blocker?`Hold-up: ${c.blocker}\n`:''}Please check the next task and record your update.\nThis draft was not sent. ${out.checks.slice(1).every(x=>x.status==='found')?'Saved finish checks are complete; an authorized person still closes the case.':'The case is not ready to close.'}`;
 }
 out.evidence=out.evidence.filter((e,i,a)=>a.findIndex(x=>x.source_id===e.source_id&&x.line===e.line&&x.quote===e.quote)===i);
 return out;
}
