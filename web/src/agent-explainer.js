import {aiCapabilities} from '../shared/ai-capabilities.js';
import {agentGuide} from '../shared/agent-guide.js';

export function agentExplanation(id,esc){
 const agent=agentGuide(id),cap=aiCapabilities.find(c=>c.id===id);if(!agent||!cap)return '';
 return `<section class="agent-explanation" aria-label="What this agent does"><span class="agent-role">${esc(agent.stage)}</span><h3>${esc(agent.name)}</h3><p>${esc(agent.job)}</p><dl><div><dt>Reads</dt><dd>${esc(agent.reads)}</dd></div><div><dt>Prepares</dt><dd>${esc(agent.prepares)}</dd></div><div><dt>You do</dt><dd>${esc(agent.human)}</dd></div></dl><p class="agent-benefit"><strong>Why it helps</strong> ${esc(agent.benefit)}</p></section>`;
}

export function agentCatalog(esc,shown=[]){
 return `<p>Each agent handles one paperwork job. Mira guides the clicks. The agents prepare work; your team checks and approves it.</p><p class="ai-boundary">These are working simulations using fictional data. No live AI model, email, insurer or payment connection.</p><div class="agent-catalog">${aiCapabilities.map((cap,index)=>{const a=agentGuide(cap.id);return `<details class="agent-catalog-item"><summary><span class="agent-number">${String(index+1).padStart(2,'0')}</span><span><strong>${esc(a.name)}</strong><small>${esc(a.job)}</small></span><span class="agent-catalog-status">${shown.includes(cap.id)?'Shown in this case':'Learn more'}</span></summary><div class="agent-catalog-detail"><p><strong>When:</strong> ${esc(a.stage)}</p><div class="agent-comparison"><p><strong>Before</strong>${esc(cap.before)}</p><p><strong>With the agent</strong>${esc(cap.after)}</p></div><dl><div><dt>Reads</dt><dd>${esc(a.reads)}</dd></div><div><dt>Prepares</dt><dd>${esc(a.prepares)}</dd></div><div><dt>You do</dt><dd>${esc(a.human)}</dd></div></dl></div></details>`;}).join('')}</div><p class="agent-catalog-footer">Start the guided case to try all ten in order. Inside a case, only agents allowed for your staff role can run.</p>`;
}

export function agentRecap(esc,shown=[]){
 return `<section class="agent-recap"><h3>What the agents helped with</h3><p>These capabilities ran on this case. Staff kept the final decisions.</p><div>${aiCapabilities.filter(c=>shown.includes(c.id)).map(c=>{const a=agentGuide(c.id);return `<article><strong>${esc(a.name)}</strong><p>${esc(a.benefit)}</p></article>`;}).join('')||'<p>No agent runs were recorded on this case.</p>'}</div></section>`;
}
