import {Problem,initialState,publicUser,has,view,caseView,canSee,mutate} from './team-model.js';
import {aiView,aiMutation,attachIntakeDocuments} from './ai-workspace.js';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function digest(token){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function repository(binding){
 const db=binding.withSession?binding.withSession('first-primary'):binding;
 return {
  async ensure(principal){await db.prepare('INSERT OR IGNORE INTO team_workspace (id, owner_id, revision, data) VALUES (1, ?, 0, ?)').bind(principal,JSON.stringify(initialState())).run();return this.read();},
  async read(){const row=await db.prepare('SELECT owner_id, revision, data FROM team_workspace WHERE id = 1').first();if(!row)throw new Problem('The team workspace is not ready.',503);return {owner:row.owner_id,state:{...JSON.parse(row.data),revision:row.revision}};},
  async commit(state,previous){const result=await db.prepare('UPDATE team_workspace SET revision = ?, data = ? WHERE id = 1 AND revision = ?').bind(state.revision,JSON.stringify(state),previous).run();if(result.meta.changes!==1)throw new Problem('The team updated the workspace. Refresh and try your action again.',409);},
  async session(token){return db.prepare('SELECT principal_id, person_id, expires_at FROM team_sessions WHERE token_hash = ?').bind(await digest(token)).first();},
  async login(principal,person){const token=crypto.randomUUID()+crypto.randomUUID(),expires=Date.now()+8*60*60*1000;await db.prepare('INSERT INTO team_sessions (token_hash, principal_id, person_id, expires_at) VALUES (?, ?, ?, ?)').bind(await digest(token),principal,person,expires).run();await db.prepare('DELETE FROM team_sessions WHERE expires_at < ?').bind(Date.now()).run();return token;},
  async logout(token){await db.prepare('DELETE FROM team_sessions WHERE token_hash = ?').bind(await digest(token)).run();},
 };
}
export async function teamAPI(request,env){
 try{
  if(!env.DB)throw new Problem('Shared database is not connected yet.',503);
  const principal=request.headers.get('oai-authenticated-user-id'),email=(request.headers.get('oai-authenticated-user-email')||'').toLowerCase();
  if(!principal)throw new Problem('Sign in to this private Site before opening the staff workspace.',401);
  const url=new URL(request.url),path=url.pathname.replace(/^\/team-api/,'')||'/',store=repository(env.DB);let {owner,state}=await store.ensure(principal);
  const isOwner=owner===principal,token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
  const member=state.users.find(u=>u.kind==='staff'&&u.email===email&&u.active);
  if(!isOwner&&!member)throw new Problem('Your email does not have an active CareFlow account. Ask the workspace admin.',403);
  if(request.method!=='GET'&&request.headers.get('origin')&&request.headers.get('origin')!==url.origin)throw new Problem('This request must come from the CareFlow Site.',403);
  let body={};if(!['GET','HEAD'].includes(request.method)){const raw=await request.text();if(raw.length>20000)throw new Problem('The form is too large.');try{body=raw?JSON.parse(raw):{};}catch{throw new Problem('Send a valid form.');}if(!body||typeof body!=='object'||Array.isArray(body))throw new Problem('Send a valid form.');}
  if(path==='/auth/demo-users'&&request.method==='GET')return json((isOwner?state.users.filter(u=>u.active):[member]).map(u=>({...publicUser(state,u),can_preview:isOwner})));
  if(path==='/auth/demo-login'&&request.method==='POST'){
   const user=isOwner?state.users.find(u=>u.id===body.user_id&&u.active):member;if(!user)throw new Problem('Choose an active team profile.');const access_token=await store.login(principal,user.id);return json({access_token,user:publicUser(state,user),can_preview:isOwner});
  }
  const session=token?await store.session(token):null;
  function actor(current){const u=current.users.find(u=>u.id===session?.person_id&&u.active);if(!session||session.principal_id!==principal||session.expires_at<Date.now()||!u||(!isOwner&&u.id!==member?.id))throw new Problem('Your staff session ended or access changed. Sign in again.',401);return u;}
  const user=actor(state);
  if(path==='/auth/logout'&&request.method==='POST'){await store.logout(token);return json({ok:true});}
  if(path==='/auth/me'&&request.method==='GET')return json({...publicUser(state,user),can_preview:isOwner});
  if(path==='/snapshot'&&request.method==='GET')return json({...view(state,user),user:{...publicUser(state,user),can_preview:isOwner}});
  if(path==='/ai/workspace'&&request.method==='GET')return json(aiView(state,user,url.searchParams.get('case_id')||null));
  if(path.startsWith('/ai/')&&request.method==='POST'){
   const mutation=aiMutation(state,user,path,body);if(!mutation.replayed)await store.commit(mutation.state,state.revision);
   const current=aiView(mutation.state,user,mutation.result.case_id);return json({...mutation.result,revision:mutation.state.revision,run:current.runs.find(r=>r.id===mutation.result.run_id)||null});
  }
  if(path==='/team'&&request.method==='GET'){if(!has(state,user,'team.manage'))throw new Problem('Admin access required.',403);return json({users:state.users.map(u=>publicUser(state,u)),roles:state.roles,archives:state.cases.filter(c=>c.archived).map(c=>({id:c.id,case_number:c.case_number,patient_name:c.patient_name,version:c.version})),audit:state.events.filter(e=>!e.case_id).slice(-60).reverse()});}
  if(path==='/events'&&request.method==='GET'){
   let cancelled=false,timer,closeTimer,last=-1;const encoder=new TextEncoder();
   const stream=new ReadableStream({start(controller){
    const close=()=>{if(cancelled)return;cancelled=true;clearTimeout(timer);clearTimeout(closeTimer);try{controller.close();}catch{}};
    const tick=async()=>{try{const current=(await store.read()).state;actor(current);if(cancelled)return;if(current.revision!==last){last=current.revision;controller.enqueue(encoder.encode(`data: ${JSON.stringify({revision:last})}\n\n`));}else controller.enqueue(encoder.encode(': connected\n\n'));timer=setTimeout(tick,1500);}catch{close();}};
    closeTimer=setTimeout(close,25000);void tick();
   },cancel(){cancelled=true;clearTimeout(timer);clearTimeout(closeTimer);}});
   return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-store','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff'}});
  }
  const match=path.match(/^\/cases\/([^/]+)$/);if(match&&request.method==='GET'){const c=state.cases.find(c=>c.id===match[1]);if(!c||!canSee(state,user,c))throw new Problem('Case not found.',404);return json(caseView(state,user,c));}
  if(request.method!=='POST')throw new Problem('This route is unavailable.',404);
  if((path==='/demo/reset'||body.demo_tour===true)&&!isOwner)throw new Problem('Only the Site owner can start or reset a guided presentation.',403);
  const mutation=mutate(state,user.id,path,body);if(!mutation.replayed){if(path==='/cases'&&body.intake_document_ids)attachIntakeDocuments(mutation.state,user,body.intake_document_ids,mutation.result.case_id);await store.commit(mutation.state,state.revision);}return json({...mutation.result,revision:mutation.state.revision});
 }catch(error){if(!(error instanceof Problem))console.error('Team API failed:',error.name,error.message);return json({detail:error instanceof Problem?error.message:'The shared workspace is temporarily unavailable. Please retry.'},error instanceof Problem?error.status:500);}
}
