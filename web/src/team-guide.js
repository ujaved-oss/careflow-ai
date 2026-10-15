export const tourKey='careflow-shared-tour-v2';
export const readTour=()=>{try{return JSON.parse(sessionStorage.getItem(tourKey))||null;}catch{return null;}};
export const saveTour=value=>{if(value)sessionStorage.setItem(tourKey,JSON.stringify(value));else sessionStorage.removeItem(tourKey);};
export const isFinished=c=>['CLOSED','CANCELLED'].includes(c.stage);
export const stageOrder=['INTAKE','DOCTOR_REVIEW','INSURANCE','SCHEDULING','PREVISIT','VISIT','REPORT','REPORT_SHARE','CLAIM','PAYMENT','CLOSURE','CLOSED'];
export const chapters=['Request','Doctor','Insurance','Appointment','Visit & report','Claim','Closed'];
export const chapterIndex=stage=>stage==='INTAKE'?0:stage==='DOCTOR_REVIEW'?1:stage==='INSURANCE'?2:stage==='SCHEDULING'?3:['PREVISIT','VISIT','REPORT','REPORT_SHARE'].includes(stage)?4:['CLAIM','PAYMENT','CLAIM_FOLLOWUP'].includes(stage)?5:6;
export function hospitalDate(value){return value?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))+' PKT':'Not booked';}
export const hospitalISO=value=>new Date(value+':00+05:00').toISOString();
export const hospitalInput=value=>{if(!value)return '';const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));const v=k=>p.find(x=>x.type===k).value;return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`;};
export const tomorrowSlot=()=>hospitalInput(new Date(Date.now()+86400000).toISOString()).slice(0,10)+'T09:00';
export const assignedName=(c,p,fallback)=>c?.assignment_names?.[p]||fallback;
export function tourMessage(c,values={}){
 if(!c)return 'Register the fictional doctor’s request. Choose who checks it next, then create the shared case.';
 const intake=assignedName(c,'work.intake','The intake person'),doctor=assignedName(c,'work.clinical','The doctor'),insurance=assignedName(c,'work.insurance','The insurance person'),scheduler=assignedName(c,'work.schedule','The scheduling person'),claims=assignedName(c,'work.claims','The claims person'),closer=assignedName(c,'work.close','The closing reviewer');
 if(c.stage==='INTAKE'&&c.correction)return `${intake} fixes the returned details, then sends the request to ${doctor} for another check. The saved reason explains what to change.`;
 if(c.stage==='DOCTOR_REVIEW'&&values.action==='doctor_return')return `${doctor} is returning this request. Write exactly what intake needs to fix. It will go back to ${intake}.`;
 if(c.stage==='INSURANCE'){
  const answer=values.status||c.insurance_status;
  if(['Denied','More information'].includes(answer))return `${insurance} records the insurer’s answer and what needs fixing. Saving sends this case to ${intake}; it does not approve the test.`;
  if(answer==='Pending')return `${insurance} records that the insurer has not answered yet. The case stays here until a new answer is recorded. Check the insurer outside CareFlow.`;
  return `${insurance} checks the insurer outside CareFlow. Choose its answer and add the reference and response. An approval sends the case to ${scheduler}.`;
 }
 if(c.stage==='PAYMENT'&&values.status==='Denied')return `${claims} records why the bill was denied. The next step is to correct and resubmit the same bill.`;
 if(c.stage==='PAYMENT'&&(values.status||c.claim_status)==='Pending')return `${claims} is waiting for the insurer’s payment answer. Record the follow-up here; the case stays open. No money moves.`;
 return ({INTAKE:`${intake} checks the request and supporting note, then sends the same case to ${doctor}.`,DOCTOR_REVIEW:`${doctor} checks the request. Missing information goes back to ${intake}.`,SCHEDULING:`${scheduler} chooses the date and confirms one appointment. The doctor reviews the visit next.`,PREVISIT:`${doctor} records the before-visit check. The scheduling person can still change this booking.`,VISIT:'Jump to the sample visit day. Tick the time-jump box, then record that the visit finished.',REPORT:`${doctor} writes the fictional report. Only the roles allowed to read it see its text.`,REPORT_SHARE:`${doctor} records who receives the report. This demo records the handoff; it does not send an email.`,CLAIM:`${claims} records the sample bill. Nothing is submitted to a real insurer.`,CLAIM_FOLLOWUP:`${claims} reads the denial reason, corrects the bill and records another submission.`,PAYMENT:`${claims} records the insurer’s payment answer. A paid bill goes to ${closer}. No money moves.`,CLOSURE:`${closer} checks the finished visit, shared report and paid bill, then closes the case.`,CLOSED:'You finished this case. The results explain its saved actions. You can now create a normal case.',CANCELLED:'This case was stopped before the visit. The history is kept, and there is no next task.'})[c.stage]||'Look at the next task below.';
}
export const tourNotes=Object.fromEntries([...stageOrder,'CLAIM_FOLLOWUP','CANCELLED'].map(stage=>[stage,tourMessage({stage})]));
export function sampleFields(c,values={}){
 const ref=c?.case_number||'DEMO';
 if(!c)return {patient_name:'Amelia Hart',source:'email',procedure:'MRI brain',order_note:`Fictional request: please arrange an ${values.procedure||'MRI brain'} for ${values.patient_name||'Amelia Hart'}. Supporting note included.`,doctor_note:'Fictional supporting note supplied by the referring practice.'};
 const status=values.status||(['Approved','Denied','Pending','More information'].includes(c.insurance_status)?c.insurance_status:'Approved');
 const insurerText={Approved:'Fictional insurer answer: the requested test is approved.',Denied:'Fictional insurer answer: supporting request details are missing.',Pending:'Fictional follow-up: waiting for the insurer’s answer.', 'More information':'Fictional insurer answer: please send the missing supporting note.'};
 const payment=values.status||'Paid';
 return ({INTAKE:{doctor_note:c.doctor_note||'Fictional supporting note checked.'},DOCTOR_REVIEW:{note:values.action==='doctor_return'?'Fictional correction needed: check the ordered test and supporting note.':'Fictional request and supporting note reviewed by the doctor.'},INSURANCE:{status,medium:'Insurer portal',reference:`AUTH-SYN-${ref}`,evidence:insurerText[status]},SCHEDULING:{scheduled_at:tomorrowSlot(),location:'Sample MRI room A'},PREVISIT:{note:'Fictional before-visit check recorded.'},VISIT:{},REPORT:{report_text:'Fictional MRI demonstration report. No real patient or clinical interpretation.'},REPORT_SHARE:{recipient:'Fictional referring practice'},CLAIM:{reference:`CLAIM-SYN-${ref}`,amount:'1200',currency:'USD'},CLAIM_FOLLOWUP:{correction_note:'Fictional correction: the missing supporting attachment was checked for this resubmission. No real claim was sent.',reference:c.claim_reference||`CLAIM-SYN-${ref}`,amount:String(c.claim_amount||1200),currency:c.claim_currency||'USD'},PAYMENT:{status:payment,reference:`PAY-SYN-${ref}`,evidence:payment==='Denied'?'Fictional denied bill: correct the sample billing reference.':payment==='Pending'?'Fictional follow-up: payment answer is still pending.':'Fictional remittance: this sample bill is paid in full. No funds moved.'},CLOSURE:{}})[c.stage]||{};
}
const reviewedEvents=['Case created','Sent to the doctor','Doctor checked the order','Returned to intake','Insurance answer recorded','Appointment booked','Appointment rescheduled','Appointment cancelled','Request corrected','Visit completed','Before-visit check complete','Report finished','Report shared','Claim submitted','Claim answer recorded','Case closed','Case cancelled'];
export function tourMetrics(c){
 const saved=(c.history||[]).filter(e=>reviewedEvents.includes(e.event));
 const remaining=isFinished(c)?0:stageOrder.length-1-Math.max(0,stageOrder.indexOf(c.stage==='CLAIM_FOLLOWUP'?'CLAIM':c.stage));
 return [
  {label:'Case closed',value:c.stage==='CLOSED'?1:0,definition:'One case with a finished visit, shared report, paid sample bill and a final review. A cancelled case is not counted as completed.'},
  {label:'People involved',value:new Set(saved.map(e=>e.actor_id)).size,definition:'Different staff profiles that saved a request or a decision in this case.'},
  {label:'Appointments',value:saved.filter(e=>e.event==='Appointment booked').length,definition:'Bookings recorded for this case. Moving a booking keeps the same appointment; cancelling and booking again adds a new one.'},
  {label:'Saved steps',value:saved.length,definition:'Saved requests, decisions and corrections. A return, pending answer or resubmission adds a saved step.'},
  {label:'Steps left',value:remaining,definition:'Required stages still ahead. Completed and cancelled cases have no next task. Cancellation does not mean the visit or payment happened.'},
 ];
}
export function caseAnswer(question,c){
 const q=question.toLowerCase().trim();
 const doctor=assignedName(c,'work.clinical','The doctor'),insurer=assignedName(c,'work.insurance','The insurance coordinator'),scheduler=assignedName(c,'work.schedule','The scheduling coordinator'),claims=assignedName(c,'work.claims','The claims coordinator');
 if(/price|pricing|contract|hipaa|compliance|diagnos|prescri|dosage/.test(q))return 'That is outside this demo. Your presenter can discuss commercial, clinical and hospital-specific requirements.';
 if(/who.*(?:for|use)|what.*(?:product|careflow)|what is this|why.*(?:need|use)|purpose|solve/.test(q))return 'CareFlow is a shared workspace for hospital admins, coordinators, doctors and billing staff. It keeps a request, its next task and its responsible person together, so the team can stop chasing updates.';
 if(/(?:doctor|clinical|order).*(?:approv|review|check)|(?:approv|review|check).*(?:doctor|order)|who.*doctor/.test(q))return `${doctor} checks the doctor’s request and supporting note. The insurer makes a separate insurance decision; it does not perform the doctor’s review.`;
 if(/resched|change.*(?:appointment|booking|date)|move.*(?:appointment|booking)/.test(q))return `${scheduler} can use “Change booking” before the visit is completed. The new date is saved in PKT and the doctor repeats the before-visit check.`;
 if(/cancel/.test(q))return 'Scheduling can cancel a booking and arrange another one before the visit. Admin can stop the whole case before the visit is completed. The history stays saved; no cancellation message is sent.';
 if(/correct|edit|wrong|mistake/.test(q))return 'The assigned intake person or admin uses “Correct request” before booking. The original source stays saved and the doctor and insurer check the corrected request again.';
 if(/self.?pay|write.?off|written off/.test(q))return 'This sample covers an insured bill that is paid, or a case cancelled before its visit. Self-pay and bill write-off workflows are not connected in this demo.';
 if(/insur|payer|insurance approval/.test(q)&&!(/claim|payment|bill/.test(q)))return `The insurer decides coverage. ${insurer} checks its portal, letter or phone answer outside CareFlow and records it here.${c?` Current insurance answer: ${c.insurance_status}.`:''}`;
 if(/book|appointment|schedule/.test(q))return `${scheduler} books the appointment after the doctor’s check and insurance approval. The doctor handles the visit and report next.`;
 if(/start|source|email|paper|request|data/.test(q))return `A doctor’s request arrives by email, paper, a hospital system or reception. The Referral agent can fill a draft for a person to check and approve. Intake then checks the papers.${c?` This fictional request is ${c.external_reference}.`:''} No inbox or hospital feed is connected.`;
 if(/claim|denied|payment|bill/.test(q)){const denial=c?.claim_responses?.findLast(r=>r.status==='Denied');return `${claims} records the insurer’s payment answer. A denied bill stays with claims for correction; pending means wait and follow up. No bill is sent and no money moves.${c?` Current claim: ${c.claim_status}.`:''}${denial?` Saved denial reason: ${denial.evidence}`:''}`;}
 if(/\bai\b|bot|copilot|assistant|mira/.test(q))return 'Mira guides the clicks. Ten simulated agents do the sample paperwork: read the referral, sort papers, find missing items, draft requests, prepare insurance work, read replies, summarize the handoff, find case answers, draft claim replies and check the finish. Open AI agents to see each job. You review and save decisions. No live model or paid API is used.';
 if(/access|account|role|sign|security/.test(q))return 'Admin creates an account and role here. The owner separately grants access to this private Site. Staff use their own ChatGPT sign-in. Only the owner can preview the demo profiles.';
 if(/result|number|saving|revenue|time/.test(q))return 'The results count saved actions, people and bookings from this case. They do not measure time saved, revenue, patient outcomes or compliance.';
 if(/next|happens now|current step/.test(q))return tourMessage(c);
 return 'I could not match that question. I can explain who this is for, doctor review, insurance, booking, corrections, claims and the results. Try one of those topics.';
}
export function nextField(form){
 if(!form)return null;
 const fields=[...form.elements].filter(el=>el.name&&el.type!=='hidden'&&el.type!=='submit'&&el.required);
 return fields.find(el=>el.type==='checkbox'?!el.checked:!String(el.value).trim())||form.querySelector('[type="submit"]');
}
