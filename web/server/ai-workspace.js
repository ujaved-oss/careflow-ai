import {Problem,has,canSee,caseView,capabilities} from './team-model.js';
import {mockProvider,documentKind,documentScopes,validateAgentResult} from './ai-engine.js';
import {aiCapabilities} from '../shared/ai-capabilities.js';
const permissionStamp=(state,user)=>[...capabilities(state,user)].sort().join('|');
export const canReadDocument=(state,user,d)=>d.kind==='unknown'?d.created_by===user.id:d.scopes.some(p=>has(state,user,p));
function getCase(state,user,id){const c=state.cases.find(c=>c.id===id);if(!c||c.archived||!canSee(state,user,c))throw new Problem('Case not found.',404);return c;}
export function aiView(state,user,caseId){
 const c=caseId?getCase(state,user,caseId):null;
 const documents=(state.ai_documents||[]).filter(d=>(c?d.case_id===c.id:!d.case_id&&d.created_by===user.id)&&canReadDocument(state,user,d));
 const runs=(state.ai_runs||[]).filter(r=>r.actor_id===user.id&&r.permission_stamp===permissionStamp(state,user)&&r.case_id===(c?.id||null)&&r.document_ids.every(id=>documents.some(d=>d.id===id)));
 return {provider:'simulation',network_calls:false,case_id:c?.id||null,case_version:c?.version||null,documents,runs:runs.slice(-20).reverse(),capabilities:aiCapabilities.filter(cap=>!cap.permission||has(state,user,cap.permission)),boundary:'Simulated AI. Fictional data only. No model, insurer or email connection.'};
}
function input(v,label,max){if(typeof v!=='string'||!v.trim()||v.length>max)throw new Problem(`Enter ${label} (up to ${max} characters).`);return v.trim();}
export function attachIntakeDocuments(state,user,ids,caseId){
 if(!Array.isArray(ids)||ids.length>10)throw new Problem('Choose up to ten saved intake documents.');
 const docs=ids.map(id=>(state.ai_documents||[]).find(d=>d.id===id));
 if(docs.some(d=>!d||d.created_by!==user.id||!canReadDocument(state,user,d)||(d.case_id&&d.case_id!==caseId)))throw new Problem('Only your unattached intake documents can be linked.',403);
 for(const d of docs)d.case_id=caseId;
 const intakeRun=(state.ai_runs||[]).find(r=>r.actor_id===user.id&&r.output.capability==='intake'&&r.document_ids.some(id=>ids.includes(id)));
 if(intakeRun&&!state.events.some(e=>e.case_id===caseId&&e.capability==='intake'))state.events.push({id:crypto.randomUUID(),case_id:caseId,actor_id:user.id,actor_name:user.name,event:'Demo assistant activity',capability:'intake',note:'Simulated referral reader used. Staff separately reviewed and registered the case.',created_at:new Date().toISOString()});
}
export function aiMutation(original,user,path,body,at=new Date().toISOString()){
 const op=input(body.operation_id,'an operation reference',100),existing=original.receipts.find(r=>r.id===op&&r.actor===user.id);
 if(existing){if(existing.path!==path||existing.body!==JSON.stringify(body))throw new Problem('This operation reference was used for different details.',409);const result=existing.result;
  // Replayed outputs must never survive a role change or lost case access.
  if(result.case_id)getCase(original,user,result.case_id);
  if(result.run_id&&!aiView(original,user,result.case_id).runs.some(r=>r.id===result.run_id))throw new Problem('Access to this result changed. Run it again with your current access.',403);
  return {state:original,result,replayed:true};
 }
 const state=structuredClone(original);state.ai_documents??=[];state.ai_runs??=[];let result;
 if(path==='/ai/documents'){
  const c=body.case_id?getCase(state,user,body.case_id):null;
  if(!c&&!has(state,user,'work.intake'))throw new Problem('Intake access is required before starting a case.',403);
  if(c&&(!c.assignments||!Object.values(c.assignments).includes(user.id))&&!has(state,user,'cases.all'))throw new Problem('Only the assigned case team can attach papers.',403);
  if(body.fictional!==true)throw new Problem('Confirm this is fictional data before adding the paper.');
  if(state.ai_documents.length>=200)throw new Problem('The demo document limit was reached. Use the existing papers.');
  const name=input(body.name,'a document name',100),source=input(body.text,'fictional document text',12000),candidate={text:source};
  const detected=documentKind(candidate),kind=detected==='unknown'?(body.kind||'unknown'):detected;if(!Object.hasOwn(documentScopes,kind))throw new Problem('Choose a supported paper type.');
  const scopes=documentScopes[kind];if(scopes.length&&!scopes.some(p=>has(state,user,p)))throw new Problem('Your role cannot add or read this type of paper.',403);
  const doc={id:crypto.randomUUID(),case_id:c?.id||null,name,text:source,kind,scopes:[...scopes],created_by:user.id,created_at:at,label_reviewed:false};
  state.ai_documents.push(doc);result={document_id:doc.id,case_id:doc.case_id};
 }else if(path==='/ai/label'){
  const d=state.ai_documents.find(d=>d.id===body.document_id);if(!d||!canReadDocument(state,user,d))throw new Problem('Document not found.',404);if(d.case_id)getCase(state,user,d.case_id);else if(d.created_by!==user.id)throw new Problem('Document not found.',404);
  if(body.reviewed!==true)throw new Problem('Review the suggested paper label first.');d.label_reviewed=true;result={document_id:d.id,case_id:d.case_id};
 }else if(path==='/ai/run'){
  const cap=aiCapabilities.find(x=>x.id===body.capability);if(!cap)throw new Problem('Choose a supported demo skill.');if(cap.permission&&!has(state,user,cap.permission))throw new Problem('Your role cannot run this skill.',403);
  const c=body.case_id?getCase(state,user,body.case_id):null;if(!c&&cap.id!=='intake')throw new Problem('Open a case before running this skill.');if(c&&cap.id==='intake')throw new Problem('Read a referral before creating its case.');
  if(c&&body.expected_version!==c.version)throw new Problem('This case changed. Open its latest details before running the helper.',409);
  const available=aiView(state,user,c?.id).documents;
  const ids=body.document_ids||available.map(d=>d.id);if(!Array.isArray(ids)||ids.length>30||ids.some(id=>!available.some(d=>d.id===id)))throw new Problem('A selected document is unavailable to your role.',403);
  const docs=available.filter(d=>ids.includes(d.id));if(cap.id==='intake'&&!docs.length)throw new Problem('Add a fictional referral first.');
  const question=cap.id==='ask'?input(body.question,'a case question',500):'';
  const context={capability:cap.id,caseRecord:c?caseView(state,user,c):null,documents:docs,question,at};
  let output;try{output=validateAgentResult(mockProvider.run(context),context);}catch{throw new Problem('The demo helper could not verify its sources. Your case was kept. Please retry.',422);}
  const run={id:crypto.randomUUID(),actor_id:user.id,permission_stamp:permissionStamp(state,user),case_id:c?.id||null,case_version:c?.version||null,document_ids:docs.map(d=>d.id),question,output,created_at:at};state.ai_runs.push(run);state.ai_runs=state.ai_runs.slice(-500);result={run_id:run.id,case_id:run.case_id};
 }else throw new Problem('Demo helper route not found.',404);
 state.revision=original.revision+1;state.receipts.push({id:op,actor:user.id,path,body:JSON.stringify(body),result});state.receipts=state.receipts.slice(-500);
 state.events.push({id:crypto.randomUUID(),case_id:result.case_id,actor_id:user.id,actor_name:user.name,event:'Demo assistant activity',capability:path==='/ai/run'?body.capability:null,document_kind:path==='/ai/documents'?state.ai_documents.find(d=>d.id===result.document_id)?.kind:null,note:path==='/ai/run'?`Simulated ${body.capability} suggestion prepared. No case decision was changed.`:'Fictional demo document reviewed or added.',created_at:at});
 if(JSON.stringify(state).length>1500000)throw new Problem('This demo workspace reached its storage limit. Your existing cases and papers were kept.',413);
 return {state,result};
}
