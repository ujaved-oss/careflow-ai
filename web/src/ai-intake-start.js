import {samplePaper} from '../shared/demo-papers.js';
// Preparation saves only the source and suggestion. The approval action is separate.
export async function prepareIntake(request,{reference=`SYN-${crypto.randomUUID().slice(0,8)}`,patient='Amelia Brooks',procedure='MRI brain'}={}){
 const source=samplePaper('referral',{patient_name:patient,external_reference:reference,procedure});
 const document=await request('/ai/documents',{...source,operation_id:`prepare-paper:${reference}`});
 const result=await request('/ai/run',{capability:'intake',document_ids:[document.document_id],operation_id:`prepare-reader:${reference}`});
 const fields=Object.fromEntries(result.run.output.fields.map(f=>[f.name,f.value]));
 if(result.run.output.fields.some(f=>f.status!=='found')||!fields.external_reference.startsWith('SYN-'))throw new Error('The demo could not prepare a complete supported request. No case was created.');
 return {fields,source,document_id:document.document_id,run:result.run};
}
