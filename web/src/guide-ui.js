import {viewerMode, viewerCheckpoint, viewerState, snapshot} from './gateway.js';
import {guideSteps, productQuestions, productAnswer} from './guide-content.js';
import {guideMetrics} from './guide-model.js';
import {walkthroughTasks, reviewCards, nextInstruction, fieldComplete, nextCheckpoint} from './walkthrough.js';
export function createGuide({app,esc,icon,button,pretty,badge,displayStatus,readyToSchedule,nextStep,flowMarkup,proposalDetails,caseRows,empty,bindCases,ask,toast,openDocument,beginViewer,onCase,updateStore}) {
 let botOpen=false, lastGuided=false, busy=false, generation=0, values={}, opened={}, journey;
 function stopGuide(){ window.speechSynthesis?.cancel(); }
 function loadDrafts(){
  const state=viewerState();
  if(journey===state.startedAt) return;
  journey=state.startedAt; values={}; opened={};
  try {const saved=JSON.parse(sessionStorage.getItem('careflow-walkthrough-drafts')); if(saved?.journey===journey){values=saved.values||{};opened=saved.opened||{};}} catch{}
 }
 function saveDrafts(){sessionStorage.setItem('careflow-walkthrough-drafts',JSON.stringify({journey,values,opened}));}
 function currentPrompt(){const index=viewerState().guideIndex,task=walkthroughTasks[index];return task ? nextInstruction(task,values[index]||{},!!opened[index]||!task.start) : {target:'results',instruction:'Click “Open results sheet”.',example:''};}
 function targetElement(prompt=currentPrompt()){ return app.querySelector(`[data-walk-target="${prompt.target}"]`); }
 function pointTarget(focus=false){
  app.querySelectorAll('.walk-target').forEach(e=>e.classList.remove('walk-target'));
  app.querySelector('.walk-inline-cue')?.remove();
  const target=targetElement(); if(!target) return;
  target.classList.add('walk-target');
  const cue=document.createElement('p'),prompt=currentPrompt();cue.className='walk-inline-cue';cue.textContent=prompt.example?`Type: ${prompt.example}`:prompt.instruction;
  (target.matches('button[type="submit"]')?target.parentElement:target).before(cue);
  if(focus){const rect=target.getBoundingClientRect();if(rect.top<90||rect.bottom>window.innerHeight-30)target.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});(target.matches('input,select,button')?target:target.querySelector('input,select,button'))?.focus({preventScroll:true});}
 }
 function updatePrompt(){
  const prompt=currentPrompt(), index=viewerState().guideIndex,task=walkthroughTasks[index];
  const answer=app.querySelector('#mira-chat-answer');
  if(answer) answer.innerHTML=`<p>${esc(prompt.instruction)}</p>${prompt.example?`<small>Use the sample shown under the field, or type it yourself.</small>`:''}`;
  const submit=app.querySelector('#walk-form button[type="submit"]'); if(submit) submit.disabled=busy;
  pointTarget();
  const summary=app.querySelector('#walk-entered');
  if(summary){const entered=task.fields.filter(f=>f.type!=='checkbox'&&fieldComplete(f,(values[index]||{})[f.key]));summary.innerHTML=entered.map(f=>`<div><span>${esc(f.label)}</span><strong>${f.type==='checkbox'?'Checked':esc((values[index]||{})[f.key])}</strong></div>`).join('');summary.hidden=!entered.length;}
 }
 function mountCoach(widget,state){
  widget.innerHTML=`<div class="walk-coach-top"><span class="mira-avatar small">${icon('sparkle')}</span><strong>Mira <small>Your guide</small></strong><span class="walk-step">Step ${Math.min(state.guideIndex+1,25)} / 25</span></div><div class="walk-coach-body"><div id="mira-chat-answer" aria-live="polite"></div><div class="walk-coach-actions">${button('Back',`data-mira-back ${state.guideIndex===0?'disabled':''}`,'secondary','arrow-left')}${button('Show me','data-mira-point','secondary','arrow-up-right')}</div></div><details class="mira-ask-details"><summary>I have a question</summary><div class="mira-question-chips"><button data-mira-question="How does a case start?">Where does the request come from?</button><button data-mira-question="How does booking work?">How does booking work?</button></div><div id="walk-help-answer" aria-live="polite"></div><form id="mira-chat-form"><label class="sr-only" for="mira-question">Ask Mira</label><input id="mira-question" maxlength="2000" placeholder="Ask about the demo" required><button class="icon-button" type="submit" aria-label="Send question to Mira">${icon('arrow-up')}</button></form></details>`;
  app.querySelector('.guided-stage').insertBefore(widget,app.querySelector('.guide-screen'));
  widget.querySelector('[data-mira-back]').onclick=()=>goGuide(state.guideIndex-1);
  widget.querySelector('[data-mira-point]').onclick=()=>{widget.querySelector('details').open=false;pointTarget(true);};
  const answer=q=>{widget.querySelector('#walk-help-answer').innerHTML=`<strong>${esc(q)}</strong><p>${esc(productAnswer(q))}</p>`;};
  widget.querySelectorAll('[data-mira-question]').forEach(b=>b.onclick=()=>answer(b.dataset.miraQuestion));
  widget.querySelector('form').onsubmit=e=>{e.preventDefault();answer(widget.querySelector('#mira-question').value);};
  updatePrompt();
 }
 function mountBot(){
  app.querySelector('#mira-widget')?.remove(); if(!app.querySelector('.workspace'))return;
  const state=viewerState(),guided=viewerMode&&!!app.querySelector('.guide-screen');
  if(guided!==lastGuided){botOpen=guided;lastGuided=guided;}
  const widget=document.createElement('aside');widget.id='mira-widget';widget.className=`mira-widget ${guided?'mira-guiding':''}`;widget.setAttribute('aria-label','Mira walkthrough assistant');
  if(guided){mountCoach(widget,state);return;}
  widget.innerHTML=`<button class="mira-launcher" aria-label="${botOpen?'Minimize':'Open'} Mira assistant" aria-expanded="${botOpen}"><span class="mira-avatar small">${icon('sparkle')}</span><span><strong>Mira</strong><small>${guided?'Your next click, made clear':'Ask about CareFlow'}</small></span>${icon(botOpen?'caret-down':'chat-circle-text')}</button><section class="mira-chat ${botOpen?'is-open':''}"><div class="mira-chat-heading"><span>${guided?`${Math.min(state.guideIndex+1,25)} of 25 practice steps`:'How can I help?'}</span><span class="badge neutral">${guided?'Your turn':'Sample data'}</span></div><div id="mira-chat-answer" aria-live="polite">${guided?'':"<p>I can explain the product or guide you through a sample case.</p>"}</div>${guided?`<div class="walk-waiting">${icon('arrow-up-right')}<span>I'll wait for you.</span></div><div class="mira-bot-controls">${button('Back',`data-mira-back ${state.guideIndex===0?'disabled':''}`,'secondary','arrow-left')}${button('Show me','data-mira-point','primary','arrow-up-right')}</div>`:button('Try a guided case','data-mira-tour','primary','arrow-right')}<details class="mira-ask-details"><summary>Ask a question</summary><div class="mira-question-chips"><button data-mira-question="How does a case start?">Where does the data come from?</button><button data-mira-question="How does booking work?">How does booking work?</button></div><form id="mira-chat-form"><label class="sr-only" for="mira-question">Ask Mira</label><input id="mira-question" maxlength="2000" placeholder="Ask about the demo" required><button class="icon-button" type="submit" aria-label="Send question to Mira">${icon('arrow-up')}</button></form><button class="text-link" data-mira-return>Back to my instruction</button></details><small class="mira-bot-disclosure">Made-up patient. Practice actions only.</small></section>`;
  if(guided)app.querySelector('.guided-stage').insertBefore(widget,app.querySelector('.guide-screen'));else app.append(widget);
  widget.querySelector('.mira-launcher').onclick=()=>{botOpen=!botOpen;widget.querySelector('.mira-chat').classList.toggle('is-open',botOpen);const b=widget.querySelector('.mira-launcher');b.setAttribute('aria-expanded',String(botOpen));b.setAttribute('aria-label',`${botOpen?'Minimize':'Open'} Mira assistant`);};
  widget.querySelector('[data-mira-back]')?.addEventListener('click',()=>goGuide(state.guideIndex-1));
  widget.querySelector('[data-mira-point]')?.addEventListener('click',()=>{widget.querySelector('details').open=false;updatePrompt();pointTarget(true);});
  widget.querySelector('[data-mira-tour]')?.addEventListener('click',beginViewer);
  const answer=q=>{widget.querySelector('#mira-chat-answer').innerHTML=`<strong>${esc(q)}</strong><p>${esc(productAnswer(q))}</p>`;};
  widget.querySelectorAll('[data-mira-question]').forEach(b=>b.onclick=()=>answer(b.dataset.miraQuestion));
  widget.querySelector('#mira-chat-form').onsubmit=e=>{e.preventDefault();answer(widget.querySelector('#mira-question').value);widget.querySelector('#mira-question').value='';};
  widget.querySelector('[data-mira-return]').onclick=()=>{widget.querySelector('details').open=false;if(guided)updatePrompt();else mountBot();};
  if(guided)updatePrompt();
 }
  function guideAssistantMarkup() {
    return `<section class="assistant-panel tour-copilot"><div class="assistant-heading"><span class="feature-icon">${icon("sparkle")}</span><div><h3>CareFlow Copilot</h3><span>The case assistant for everyday staff</span></div></div><div id="assistant-answer" aria-live="polite"><div class="answer-bubble">The doctor's note is missing. Ask for it before sending the insurance request.</div><div class="source-chips"><button data-source-document="tour-order">${icon("link")}MRI referral order / p.1 / v1</button></div></div><div class="question-suggestions"><button data-question="Why is this case blocked? What documents are missing?">What's blocking this case?</button><button data-question="What is the clinical status?">What did the care team record?</button></div><form id="assistant-form"><label class="sr-only" for="assistant-input">Ask about this case</label><input id="assistant-input" required placeholder="Ask about this care journey" maxlength="2000"><button class="icon-button send-button" type="submit" aria-label="Send question">${icon("arrow-up")}</button></form><small>Scripted, source-linked demo answers. The care team makes medical decisions.</small></section>`;
  }
  function guideCanvas(step, state) {
    const c = state.cases[0];
    if (!c)
      return `<div class="guide-empty"><div class="guide-zero">0</div><h2>No cases yet.</h2><p>A clean workspace. A new story.</p><div class="empty-lanes">${["files", "shield-check", "calendar-check", "stethoscope", "receipt"].map((x) => `<span>${icon(x)}</span>`).join("")}</div><span class="badge neutral">Viewer profile / Sample data</span></div>`;
    const patientHeader = `<div class="guide-patient"><span class="avatar">AH</span><div><strong>Amelia Hart</strong><small>CF-DEMO-1041 / Sample MRI case</small></div>${badge(displayStatus(c))}</div>`;
    let body;
    if (step.view === "intake")
      body = `<div class="guide-intake"><div class="guide-intake-source">${icon("envelope")}<span><strong>Referral inbox / sample email</strong><small>From the fictional referring practice</small></span><span class="badge good">Registered</span></div><article class="referral-message"><strong>Please arrange an outpatient MRI for Amelia Hart</strong><p>The signed MRI order is attached. Our supporting note will follow.</p><span>${icon("file-text")}referral-order.pdf / Page 1 / Version 1</span></article><div class="guide-action-fields"><div><span>Patient match</span><strong>Amelia Hart / reviewed</strong></div><div><span>Order</span><strong>MRI brain / 70551 / verified</strong></div><div><span>Coverage</span><strong>Sample insurance / verified</strong></div><div><span>Referral source</span><strong>SYN-EMAIL-1041</strong></div></div><p class="guide-complete">${icon("check-circle")} Intake created one shared case. No appointment exists yet.</p><p class="action-hint">Email, fax, scanned paper, reception and EHR are possible intake channels. All sources in this demonstration are simulated.</p></div>`;
    else if (step.view === "documents")
      body = `<div class="guide-document-list">${state.documents.map((d) => `<button class="document-row" data-document="${esc(d.id)}"><span class="file-symbol">${icon("file-text")}</span><span><strong>${esc(d.title)}</strong><small>Original sample / Page 1 / Version ${d.version}</small></span>${badge(d.verification_status)}${icon("arrow-up-right")}</button>`).join("")}${c.document_status !== "COMPLETE" ? `<div class="guide-gap">${icon("flag")}<span>Doctor’s note missing<small>Alex is collecting this note</small></span></div>` : `<div class="guide-complete">${icon("check-circle")} All the needed papers are here.</div>`}</div>`;
    else if (step.view === "assistant") body = guideAssistantMarkup();
    else if (step.view === "proposal" || step.view === "approval-done") {
      const a = state.approvals.at(-1);
      body = `<div class="guide-proposal"><div class="guide-panel-heading"><span class="feature-icon">${icon("hand-palm")}</span>${badge(a.status)}</div><h2>${esc(pretty(a.action_type))}</h2><div class="payload-details">${proposalDetails(a)}</div><div class="guide-review-boundary">${icon("user-check")}<span>${a.status === "COMPLETED" ? "Alex checked and approved this" : "Waiting for Alex to check this"}<small>Practice only. No real action was sent.</small></span></div>${a.status === "COMPLETED" ? `<p class="guide-complete">${icon("check-circle")} ${state.approvals.filter((x) => x.status === "COMPLETED").length} of 4 demo reviews recorded</p>` : `<p class="action-hint">In everyday use, authorized staff inspect this proposal and approve or reject it. Mira demonstrates that review at the next stop.</p>`}</div>`;
    } else if (step.view === "queue")
      body = `<div class="guide-queue"><div class="filter-tabs"><button class="active" data-guide-filter="ready">Ready to book</button><button data-guide-filter="all">All cases</button></div><label class="search-field">${icon("magnifying-glass")}<span class="sr-only">Search the demo case</span><input id="guide-case-search" type="search" placeholder="Find Amelia or CF-DEMO-1041"></label><div id="guide-queue-rows">${caseRows(state.cases)}</div><p class="action-hint">Search and inspect this case. Viewer access is read-only.</p></div>`;
    else if (step.view === "schedule") {
      const a = state.appointments[0];
      body = `<div class="guide-schedule"><span class="calendar-square">${icon("calendar-check")}</span><h2>The visit is booked.</h2><p>${new Date(a.scheduled_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p><strong>${esc(a.location)}</strong><div class="guide-complete">${icon("check-circle")} Appointment checked and confirmed</div><p class="action-hint">The appointment time is fictional. Clinical and financial work continue.</p></div>`;
    } else if (step.view === "clinical") {
      const milestones = [
        "PREVISIT_REVIEW",
        "READY",
        "SERVICE_COMPLETED",
        "REPORT_FINAL",
        "COMMUNICATION_COMPLETE",
      ];
      body = `<div class="guide-clinical"><div class="guide-panel-heading"><span class="feature-icon">${icon("stethoscope")}</span><span class="badge neutral">Care team only</span></div><h2>The care team handles these checks.</h2><div class="guide-milestones">${milestones
        .map((m) => {
          const recorded = state.events.some((e) => e.event_type === m);
          return `<div class="${recorded ? "recorded" : ""}"><span>${icon(recorded ? "check-circle" : "clock-counter-clockwise")}</span><strong>${pretty(m)}</strong><small>${recorded ? "Recorded by the sample care team" : "Not recorded"}</small></div>`;
        })
        .join(
          "",
        )}</div><p class="action-hint">Mira shows simulated staff actions. The assistant makes no clinical judgment.</p></div>`;
    } else if (step.view === "financial")
      body = `<div class="guide-financial"><span class="feature-icon">${icon("receipt")}</span><h2>Keep the bill in view.</h2><div class="financial-status"><div><span>Report shared</span>${badge(c.clinical_status)}</div><div><span>Bill</span>${badge(c.financial_status)}</div></div><p>The visit and bill each have a clear status.</p><p class="action-hint">No real claim, payment, or revenue. These are sample workflow events.</p></div>`;
    else if (step.view === "timeline")
      body = `<div class="guide-timeline">${[...state.events]
        .reverse()
        .map(
          (e) =>
            `<article><span>${icon("check-circle")}</span><div><strong>${esc(pretty(e.event_type.replace(/([a-z])([A-Z])/g, "$1 $2")))}</strong><small>${esc(e.source)}</small></div></article>`,
        )
        .join(
          "",
        )}</div><p class="action-hint">Demo events follow a simulated clock. This is not measured processing time.</p>`;
    else if (step.view === "insights")
      body = `<div class="guide-results-grid">${guideMetrics(state)
        .map(
          (m) =>
            `<div><strong>${m.value}</strong><span>${m.label}</span></div>`,
        )
        .join(
          "",
        )}</div><p class="action-hint">Counts from this case, with definitions in the results sheet.</p>${button("Open results sheet", "data-results", "primary", "file-text")}`;
    else
      body = `<div class="readiness-card"><span class="feature-icon">${icon(readyToSchedule(c) ? "check-circle" : "flag")}</span><div><strong>${nextStep(c)}</strong><p>The visit and bill have their own checks.</p></div></div>${flowMarkup(c)}`;
    return `<div class="guide-canvas surface">${patientHeader}<div class="guide-canvas-body">${body}</div></div>`;
  }

 function fieldMarkup(field,index){
  const value=(values[index]||{})[field.key], id=`walk-${field.key}`;
  const common=`id="${id}" name="${field.key}" aria-describedby="sample-${field.key}"`;
  if(field.type==='checkbox') return `<label class="walk-check" data-walk-target="${field.key}"><input type="checkbox" id="${id}" name="${field.key}" ${value===true?'checked':''}>${esc(field.label)}</label>`;
  return `<div class="walk-field" data-walk-target="${field.key}"><label for="${id}">${esc(field.label)}</label>${field.type==='select'?`<select ${common}><option value="">Choose an option</option>${field.options.map(v=>`<option ${value===v?'selected':''}>${esc(v)}</option>`).join('')}</select>`:`<input type="text" ${common} value="${esc(value||'')}" maxlength="200" autocomplete="off" placeholder="${esc(field.value)}">`}<div class="walk-sample-row"><small id="sample-${field.key}">Sample: <strong>${esc(field.value)}</strong></small><button type="button" class="text-link" data-use-field="${field.key}">Use this</button></div></div>`;
 }
 function renderGuide(){
  stopGuide();loadDrafts();
  if(!sessionStorage.getItem('careflow-hands-on-v1')){viewerCheckpoint(0);sessionStorage.setItem('careflow-hands-on-v1','1');values={};opened={};journey=viewerState().startedAt;saveDrafts();}
  const state=viewerState(),index=state.guideIndex,task=walkthroughTasks[index],step=guideSteps[index];onCase(state);
  const chapters=[{name:'Request',start:0},{name:'Insurance',start:6},{name:'Visit',start:10},{name:'Bill',start:19},{name:'Closed',start:23}],active=chapters.findLast(ch=>ch.start<=index);
  const complete=index===25, c=state.cases[0],isStarted=opened[index]||!task?.start;
  const main=app.querySelector('.workspace-main');
  main.innerHTML=`<div class="guide-toolbar"><div><strong>One patient. One clear path.</strong><small>A hands-on demo. Take it at your own pace.</small></div><button class="text-link" data-guide-restart>${icon('clock-counter-clockwise')} Restart</button></div><div class="guide-chapters" aria-label="Case stages">${chapters.map((ch,n)=>`<button data-guide-jump="${ch.start}" ${ch.start>=index?'disabled':''} class="${ch===active?'active':ch.start<index?'visited':''}" ${ch===active?'aria-current="step"':''}><span>${ch.start<active.start?icon('check'):n+1}</span>${ch.name}</button>`).join('')}</div><div class="walk-progress" aria-label="Demo progress"><span style="width:${index/25*100}%"></span></div><div class="guided-stage"><section class="guide-narrative"><h1 id="guide-title" tabindex="-1">${esc(task?.title||'You finished the case.')}</h1>${c?`<div class="walk-case-strip"><span class="avatar">AH</span><span><strong>Amelia Hart</strong><small>Sample MRI case</small></span>${badge(displayStatus(c))}</div>`:'<p class="walk-empty-count">Start with a doctor’s request. Finish with a closed case.</p>'}</section><div class="guide-screen">${index===3?`<div class="walk-answer"><strong>Copilot answered</strong><p>The doctor's note is missing. Ask for it before sending the insurance request.</p><button class="text-link" data-source-document="tour-order">${icon('link')} Check the source: MRI order</button></div>`:''}${complete?`<div class="walk-action-card"><span class="badge good">Case closed</span><h2>Every step is recorded.</h2>${button('Open results sheet','data-results data-walk-target="results"','primary','file-text')}${button('Try again','data-replay','secondary','clock-counter-clockwise')}</div>`:!isStarted?`<div class="walk-action-card walk-start"><span class="feature-icon">${icon('files')}</span><h2>Meet Amelia.</h2><p>Her doctor has asked for an MRI.<br>Let’s turn that request into a case.</p>${button(task.start,'data-walk-start data-walk-target="start"','primary','file-plus')}</div>`:`<section class="walk-action-card"><div class="walk-card-header"><span>${icon('user-circle')} ${esc(guideSteps[index+1].actor)}</span><small>Made-up patient · Safe to try</small></div><p class="walk-context">${esc(task.context)}</p><form id="walk-form">${reviewCards[index]?`<div class="walk-review-preview"><strong>Check this before you approve.</strong>${reviewCards[index].map(([label,value])=>`<div><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('')}</div>`:''}${task.fields.some(f=>f.type!=='checkbox')?`<div class="walk-fill-row"><button type="button" class="text-link" data-edit-details aria-expanded="false">See all fields</button><button type="button" class="button secondary" data-use-samples>${icon('sparkle')} Use sample details</button></div>`:''}<div id="walk-entered" class="walk-entered" hidden></div><div class="walk-fields">${task.fields.map(f=>fieldMarkup(f,index)).join('')}</div><p class="walk-field-hint">${task.fields.some(f=>f.type==='checkbox')?'Check the details, then tick the box to continue.':'Your click saves this step. Nothing moves on its own.'}</p><p class="error-message" id="walk-error" role="alert"></p><div class="walk-submit">${button(task.action,'type="submit" data-walk-target="submit"','primary','arrow-right')}<span>${icon('shield-check')} Practice only</span></div></form></section>`}${c?`<details class="walk-records" ${['schedule','timeline'].includes(step.view)?'open':''}><summary>${icon('files')} ${['proposal','approval-done'].includes(step.view)?'Inspect the prepared action':'Inspect the case records'}</summary>${guideCanvas(step,state)}</details>`:''}</div></div>`;
  main.querySelector('[data-guide-restart]').onclick=beginViewer;
  main.querySelectorAll('[data-guide-jump]').forEach(b=>b.onclick=()=>goGuide(Number(b.dataset.guideJump)));
  main.querySelector('[data-walk-start]')?.addEventListener('click',()=>{opened[index]=true;saveDrafts();renderGuide();pointTarget(true);});
  main.querySelector('[data-replay]')?.addEventListener('click',beginViewer);
  main.querySelectorAll('[data-results]').forEach(b=>b.onclick=openResults);
  const form=main.querySelector('#walk-form');
  if(form){
   const remember=e=>{const f=task.fields.find(f=>f.key===e.target.name);if(!f)return;values[index]||={};values[index][f.key]=f.type==='checkbox'?e.target.checked:e.target.value;saveDrafts();main.querySelector('#walk-error').textContent='';if(f.type!=='checkbox')e.target.setAttribute('aria-invalid',String(!!e.target.value&&!fieldComplete(f,e.target.value)));updatePrompt();};
   form.addEventListener('input',remember);
   form.addEventListener('change',remember);
   form.querySelector('[data-edit-details]')?.addEventListener('click',e=>{const fields=form.querySelector('.walk-fields'),expanded=fields.classList.toggle('is-expanded');e.currentTarget.setAttribute('aria-expanded',String(expanded));e.currentTarget.textContent=expanded?'One field at a time':'See all fields';});
   const useSamples=fields=>{values[index]||={};for(const field of fields){values[index][field.key]=field.value;const input=form.elements.namedItem(field.key);input.value=field.value;input.setAttribute('aria-invalid','false');}saveDrafts();main.querySelector('#walk-error').textContent='';updatePrompt();pointTarget(true);};
   form.querySelector('[data-use-samples]')?.addEventListener('click',()=>useSamples(task.fields.filter(f=>f.type!=='checkbox')));
   form.querySelectorAll('[data-use-field]').forEach(b=>b.onclick=()=>useSamples([task.fields.find(f=>f.key===b.dataset.useField)]));
   form.onsubmit=async e=>{e.preventDefault();if(busy)return;try{const next=nextCheckpoint(index,values[index]||{},isStarted);await goGuide(next);}catch(err){main.querySelector('#walk-error').textContent=err.message;pointTarget(true);}};
  }
  main.querySelectorAll('[data-document],[data-source-document]').forEach(b=>b.onclick=()=>openDocument(b.dataset.document||b.dataset.sourceDocument));
  if(main.querySelector('#assistant-form')){main.querySelector('#assistant-form').onsubmit=e=>{e.preventDefault();ask(main.querySelector('#assistant-input').value);};main.querySelectorAll('[data-question]').forEach(b=>b.onclick=()=>ask(b.dataset.question));}
  bindCases(main);mountBot();
 }
 async function goGuide(index){
  if(busy||index<0||index>25)return;busy=true;const run=++generation;
  try{stopGuide();viewerCheckpoint(index);const store=await snapshot();if(run!==generation)return;updateStore(store);renderGuide();app.querySelector('.nav-count').textContent=store.approvals.length;window.scrollTo({top:0,behavior:'instant'});app.querySelector('#guide-title').focus({preventScroll:true});if(index===25)openResults();}
  catch(err){toast(err.message);}finally{if(run===generation){busy=false;updatePrompt();}}
 }
  function downloadSheet() {
    const state = viewerState(),
      rows = [
        ["CareFlow / Mira guided demo", "Synthetic browser counts only"],
        ["Metric", "Value", "Definition"],
        ...guideMetrics(state).map((m) => [m.label, m.value, m.definition]),
        [
          "Demo clock",
          "Events use a simulated clock",
          "No measured processing time, cost, ROI, or clinical outcome is claimed.",
        ],
      ];
    const csv = rows
      .map((row) =>
        row.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "CareFlow-demo-results.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function openResults() {
    stopGuide();
    const state = viewerState(),
      dialog = app.querySelector("#document-dialog");
    dialog.classList.add("results-dialog");
    dialog.innerHTML = `<div class="results-sheet"><header><div><span class="mira-avatar small">${icon("sparkle")}</span><span>Mira / Your demo results</span></div><button class="icon-button" data-close aria-label="Close results sheet">${icon("x")}</button></header><div class="results-intro"><span class="badge good">${state.cases[0]?.overall_status === "FULLY_RESOLVED" ? "Case closed" : "Case in progress"}</span><h2 id="document-title">One case.<br>Here is what happened.</h2><p>Amelia's sample MRI case, from the first request to the final check.</p></div><div class="results-definitions">${guideMetrics(
      state,
    )
      .map(
        (m) =>
          `<article><strong>${m.value}</strong><div><h3>${m.label}</h3><p>${esc(m.definition)}</p></div></article>`,
      )
      .join(
        "",
      )}</div><div class="results-truth">${icon("info")}<p>These are simulated workflow counts. They do not measure time saved, revenue, patient outcomes or compliance. Timeline timestamps use a simulated clock.</p></div><div class="results-actions">${button("Download results sheet", "data-download-sheet", "primary", "file-text")}${button("Product questions", "data-product-questions", "secondary", "chat-circle-text")}${button("Replay from the beginning", "data-replay", "secondary", "clock-counter-clockwise")}</div></div>`;
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    dialog.addEventListener(
      "close",
      () => dialog.classList.remove("results-dialog"),
      { once: true },
    );
    dialog.querySelector("[data-download-sheet]").onclick = downloadSheet;
    dialog.querySelector("[data-product-questions]").onclick = () => {
      dialog.close();
      openProductHelp();
    };
    dialog.querySelector("[data-replay]").onclick = () => {
      dialog.close();
      beginViewer();
    };
    if (!dialog.open) dialog.showModal();
  }
  function openProductHelp() {
    stopGuide();
    const dialog = app.querySelector("#document-dialog");
    dialog.classList.remove("results-dialog");
    dialog.innerHTML = `<div class="review-content mira-help"><header><span class="mira-avatar">${icon("sparkle")}</span><button class="icon-button" data-close aria-label="Close Mira product help">${icon("x")}</button></header><h2 id="document-title">Ask Mira.</h2><p>Clear answers about this product and this demo.</p><div id="mira-product-answer" aria-live="polite"><p>I can explain the workflow, staff assistant, approvals, access, and the demo numbers. Choose a question or ask your own.</p></div><div class="mira-questions">${productQuestions.map((q, i) => `<button data-product-question="${i}">${esc(q.question)}${icon("arrow-up-right")}</button>`).join("")}</div><form id="mira-product-form"><label for="mira-product-input" class="sr-only">Ask about CareFlow</label><input id="mira-product-input" required maxlength="1000" placeholder="Ask about the product"><button class="icon-button" type="submit" aria-label="Ask Mira">${icon("arrow-up")}</button></form><small>Scripted product guide. Questions outside the verified scope return to your presenter.</small></div>`;
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    const answer = (q, a) => {
      dialog.querySelector("#mira-product-answer").innerHTML =
        `<strong>${esc(q)}</strong><p>${esc(a)}</p>`;
    };
    dialog.querySelectorAll("[data-product-question]").forEach(
      (b) =>
        (b.onclick = () => {
          const q = productQuestions[Number(b.dataset.productQuestion)];
          answer(q.question, q.answer);
        }),
    );
    dialog.querySelector("#mira-product-form").onsubmit = (e) => {
      e.preventDefault();
      const q = dialog.querySelector("#mira-product-input").value;
      answer(q, productAnswer(q));
    };
    if (!dialog.open) dialog.showModal();
  }

 return {render:renderGuide,mount:mountBot,newCase(){if(viewerState().guideIndex!==0){values={};opened={0:true};saveDrafts();goGuide(0).then(()=>pointTarget(true));return;}opened[0]=true;saveDrafts();renderGuide();pointTarget(true);},popup(){botOpen=true;mountBot();},help:openProductHelp,stop:stopGuide,reset(){generation++;busy=false;stopGuide();values={};opened={};journey=undefined;botOpen=true;sessionStorage.removeItem('careflow-walkthrough-drafts');sessionStorage.removeItem('careflow-guide-visited');}};
}
