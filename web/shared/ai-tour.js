export function demonstratedSkills(c){return [...new Set((c?.history||[]).filter(e=>e.event==='Demo assistant activity'&&e.capability).map(e=>e.capability))];}
export function nextDemoSkill(c){
 if(!c)return {id:'intake',label:'Read the sample referral',note:'Open the reader. Run it, check the source, then fill the case form.',sample:'referral'};
 if(!c.can_act)return null;
 const done=demonstratedSkills(c);
 const plans={INTAKE:[['classify','Sort the sample papers','See which paper is the referral.'],['completeness','Find the missing note','The supporting note has not arrived yet. Run the checklist.'],['request','Draft the missing-note request','Read the draft. Then add the returned sample note.']],DOCTOR_REVIEW:[['handoff','Read the case brief','See who owns this step and what happened before.'],['ask','Ask the Case answers agent','Ask: What is the next step? Check its sources.']],INSURANCE:[['authorization','Prepare the sample insurance packet','A fictional plan rule will be added. Run the agent and inspect its evidence.','policy'],['response','Read the sample insurer reply','A fictional reply will be added. Run it, review it, and fill the insurance form.','insurance']],CLAIM_FOLLOWUP:[['denial','Prepare the claim reply','Read the recorded denial reason and the reply draft. Then record the corrected claim.']],CLOSURE:[['followup','Check that the case can finish','Run the agent. Check the visit, report and sample payment before closing.']]};
 const next=(plans[c.stage]||[]).find(([id])=>!done.includes(id));
  if(!next&&c.stage==='INTAKE'){
   const history=c.history||[],clinicalIndex=history.findLastIndex(e=>e.event==='Demo assistant activity'&&e.document_kind==='clinical');
   // Attaching the returned paper does not mean the checklist was run on it.
   // Case history preserves mutation order even when events share a timestamp.
   const checked=clinicalIndex>=0&&history.slice(clinicalIndex+1).some(e=>e.event==='Demo assistant activity'&&e.capability==='completeness');
   if(!checked)return {id:'completeness',label:'Check the returned sample note',note:clinicalIndex<0?'The fictional practice has replied. A sample note will be added. Run the checklist again to see the missing item resolved.':'The returned sample note is saved. Run the checklist again to check it before sending the case to the doctor.',sample:'clinical'};
  }
 return next?{id:next[0],label:next[1],note:next[2],sample:next[3]||null}:null;
}
export function tourPaymentExample(c){return !demonstratedSkills(c).includes('denial')?{status:'Denied',reference:'DEN-SAMPLE-1041',evidence:'Fictional payer reply: the supporting attachment is missing.'}:{status:'Paid',reference:'PAY-SAMPLE-1041',evidence:'Fictional payment recorded after the supporting attachment was checked.'};}
