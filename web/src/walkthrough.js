// Each task commits exactly one isolated fictional checkpoint after a user's action.
const text = (key,label,value) => ({key,label,type:'text',value});
const choose = (key,label,value,options) => ({key,label,type:'select',value,options});
const check = (key,label) => ({key,label,type:'checkbox',value:true});
const task = (title,action,fields=[],context='',start='') => ({title,action,fields,context,start});
export const walkthroughTasks = [
 task("Create Amelia's case",'Create case',[text('patient','Patient name','Amelia Hart'),text('reference','Request reference','SYN-EMAIL-1041'),choose('order','Requested test','MRI brain',['MRI brain','MRI knee']),check('review','I checked the patient and order')],"Sample email: Please arrange an MRI for Amelia Hart. The order is attached. The doctor's note will follow.",'New case'),
 task('Check the papers','Save paper check',[choose('missing',"Doctor's note",'Missing',['Missing','Received'])],"The MRI order is here. The doctor's note is not attached."),
 task('Ask the case assistant','Ask Copilot',[text('question','Case question','What is missing?')],"Use the staff assistant to find out what is blocking this case."),
 task("Ask for the doctor's note",'Prepare note request',[text('message','Message',"Please send Amelia's doctor's note.")],"To: Sample doctor's office. This practice message will wait for review."),
 task('Check the note request','Approve note request',[check('review','I checked the message and recipient')],"Review the prepared request below. No real email will be sent."),
 task("Receive the doctor's note",'Save checked note',[choose('document','Sample paper','doctor-note.pdf',['doctor-note.pdf','mri-order.pdf']),check('checked','I checked this sample note')],"The sample doctor's office has replied with the missing note."),
 task('Prepare the insurance request','Prepare insurance request',[check('order','Include the MRI order'),check('note',"Include the doctor's note")],"Gather both checked papers for the sample insurance company."),
 task('Check before sending','Approve insurance request',[check('review','I checked both papers and the recipient')],"The request is prepared. Check it before recording the sample submission."),
 task('Record the insurance answer','Save insurance answer',[choose('answer','Insurance answer','Approved',['Approved','Waiting']),text('reference','Approval reference','AUTH-DEMO-1041')],"The sample insurance company has approved Amelia's MRI."),
 task('Find Amelia in the case list','Find case',[text('search','Search cases','Amelia Hart')],"The papers and insurance are ready. Find Amelia's case."),
 task('Choose an appointment','Prepare booking',[choose('time','Visit time','9:00 AM',['9:00 AM','2:00 PM']),choose('location','Visit location','Sample MRI room A',['Sample MRI room A','Sample MRI room B'])],"Choose a sample time and place. A person still needs to confirm the booking."),
 task('Confirm the appointment','Confirm appointment',[check('review','I checked the patient, time and place')],"Review the booking below. Confirming it creates one sample appointment."),
 task('Check the booked visit','Open schedule',[],"Open the schedule to see the confirmed appointment."),
 task('Do the before-visit check','Save before-visit check',[choose('role','Acting as','Care team',['Care team','Office team']),check('review','The sample care team completed the before-visit check')],"You are now trying the care-team part of the demo. Only qualified staff make real medical decisions."),
 task('Mark ready for the visit','Mark ready',[check('ready','The sample care team recorded readiness')],"Record the sample care-team check."),
 task('Mark the visit finished','Finish visit',[check('finished','The sample MRI visit is finished')],"Record that the sample MRI took place. The report is still needed."),
 task('Add the report','Save checked report',[choose('report','Sample report','mri-report.pdf',['mri-report.pdf','doctor-note.pdf']),check('checked','I checked this sample report')],"The sample MRI report is ready to add to the case."),
 task('Finish the report','Finish report',[check('final','The sample care team finished the checked report')],"The report is attached. Record the care team's final check."),
 task('Share the report','Confirm report shared',[text('message','Report message',"Amelia's report is ready."),check('shared',"The sample care team shared the report with the doctor's office")],"Prepare the sample message, then record that it was shared. No real message is sent."),
 task('Send the sample bill','Submit sample bill',[text('reference','Bill reference','CLAIM-DEMO-1041')],"The visit and report are finished. Record the sample insurance bill."),
 task('Record the sample payment','Save payment status',[choose('payment','Payment status','Paid',['Paid','Waiting'])],"The sample bill is paid. No real money moves."),
 task('Check before closing','Prepare closure',[check('report','The report was shared'),check('bill','The sample bill is paid')],"Both checks are needed before asking to close the case."),
 task("Close Amelia's case",'Close case',[check('review','I checked that the case can close')],"Review closure below. This finishes Amelia's sample case."),
 task('See the case history','Open case history',[],"Open the history to inspect the recorded steps."),
 task('See your results','Open results sheet',[],"Open the sheet to see what each number means."),
];
const normalize = value => String(value ?? '').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ');
export const reviewCards = {
 4:[['To',"Sample doctor's office"],['Message',"Please send Amelia's doctor's note."]],
 7:[['To','Sample insurance company'],['Papers',"MRI order + checked doctor's note"]],
 11:[['Patient','Amelia Hart'],['Time','Tomorrow, 9:00 AM'],['Place','Sample MRI room A']],
 22:[['Report','Shared with the doctor'],['Bill','Paid'],['Open tasks','None']],
};
export function fieldComplete(field,value) { return field.type === 'checkbox' ? value === true : normalize(value) === normalize(field.value); }
export function nextInstruction(task,values={},started=true) {
 if(task.start && !started) return {target:'start',instruction:`Click “${task.start}”.`,example:''};
 const field=task.fields.find(field=>!fieldComplete(field,values[field.key]));
 if(!field) return {target:'submit',instruction:`Click “${task.action}”.`,example:''};
 return {target:field.key,instruction:field.type==='checkbox' ? `Tick “${field.label}”.` : `${field.type==='select'?'Choose':'Type'} ${field.type==='select'?`“${field.value}” in`:'in'} “${field.label}”.`,example:field.type==='text'?field.value:''};
}
export function canComplete(task,values={},started=true) { return (!task.start || started) && task.fields.every(field=>fieldComplete(field,values[field.key])); }
export function sampleDetails(task) { return Object.fromEntries(task.fields.filter(field=>field.type!=='checkbox').map(field=>[field.key,field.value])); }
export function fieldHelp(field,value) {
 if(field.type==='checkbox') return `Check “${field.label}” after you have reviewed it.`;
 return `${value ? 'For this story, use' : field.type==='select'?'Choose':'Enter'} “${field.value}” for ${field.label.toLowerCase()}. You can use the sample button.`;
}
export function nextCheckpoint(index,values,started=true) {
 const task=walkthroughTasks[index];
 if(!task) throw new Error('This case is already finished.');
 if(task.start&&!started) throw new Error('Click New case to open the form.');
 const missing=task.fields.find(field=>!fieldComplete(field,values?.[field.key]));
 if(missing) throw new Error(fieldHelp(missing,values?.[missing.key]));
 return index+1;
}
