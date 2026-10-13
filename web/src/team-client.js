const sessionKey='careflow-team-session';
export const teamToken=()=>sessionStorage.getItem(sessionKey)||'';
export async function teamRequest(path,body,method=body?'POST':'GET'){
 const payload=body?JSON.stringify({...body,operation_id:body.operation_id||crypto.randomUUID()}):undefined;
 let response;for(let attempt=0;attempt<2;attempt++){try{response=await fetch(`/team-api${path}`,{method,headers:{'Content-Type':'application/json',...(teamToken()?{Authorization:`Bearer ${teamToken()}`}:{})},...(payload?{body:payload}:{}),signal:AbortSignal.timeout(15000)});break;}catch(e){if(attempt===1)throw new Error('The connection stopped. Your form is kept. Reconnect, then retry.');}}
 const data=await response.json();if(!response.ok){const error=new Error(data.detail||'Please retry.');error.status=response.status;throw error;}return data;
}
export async function teamLogin(userId){const data=await teamRequest('/auth/demo-login',{user_id:userId});sessionStorage.setItem(sessionKey,data.access_token);localStorage.removeItem('careflow-presentation-v1');return data;}
export async function teamLogout(){try{await teamRequest('/auth/logout',{});}finally{sessionStorage.removeItem(sessionKey);}}
export function listenTeam(onChange,onConnection){
 const controller=new AbortController();let alive=true;
 const pause=ms=>new Promise(resolve=>{const finish=()=>{clearTimeout(t);controller.signal.removeEventListener('abort',finish);resolve();};const t=setTimeout(finish,ms);controller.signal.addEventListener('abort',finish,{once:true});});
 (async()=>{while(alive){try{
  const response=await fetch('/team-api/events',{headers:{Authorization:`Bearer ${teamToken()}`},signal:controller.signal});if(!response.ok)throw new Error('Connection unavailable');onConnection(true);const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  while(alive){const {value,done}=await reader.read();if(done){if(alive)onConnection(false);break;}buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n\n'))!==-1){const message=buffer.slice(0,end);buffer=buffer.slice(end+2);if(message.startsWith('data: '))onChange(JSON.parse(message.slice(6)).revision);}}
 }catch{if(alive)onConnection(false);}if(alive)await pause(1500);}})();
 return ()=>{alive=false;controller.abort();};
}
