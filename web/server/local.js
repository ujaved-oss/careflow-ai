import http from 'node:http';
import {readFileSync,mkdirSync,readdirSync} from 'node:fs';
import {sqliteBinding} from './sqlite-adapter.js';
import {teamAPI} from './team-api.js';
mkdirSync('.runtime',{recursive:true});const binding=sqliteBinding(process.env.CAREFLOW_TEAM_DB||'.runtime/team.sqlite');
binding.database.exec('CREATE TABLE IF NOT EXISTS local_team_migrations (name TEXT PRIMARY KEY)');
for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort()){if(!binding.database.prepare('SELECT name FROM local_team_migrations WHERE name = ?').get(name)){binding.database.exec('BEGIN');try{binding.database.exec(readFileSync(`drizzle/${name}`,'utf8'));binding.database.prepare('INSERT INTO local_team_migrations (name) VALUES (?)').run(name);binding.database.exec('COMMIT');}catch(e){binding.database.exec('ROLLBACK');throw e;}}}
const server=http.createServer(async(req,res)=>{
 const chunks=[];for await(const chunk of req)chunks.push(chunk);
 const headers=new Headers(req.headers);headers.set('oai-authenticated-user-id','local-owner');headers.set('oai-authenticated-user-email','owner@careflow-demo.invalid');
 const origin=headers.get('origin');const target=`${origin||'http://127.0.0.1:8788'}${req.url}`;
 const request=new Request(target,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
 const response=await teamAPI(request,{DB:binding});res.writeHead(response.status,Object.fromEntries(response.headers));
 const reader=response.body.getReader();res.on('close',()=>reader.cancel().catch(()=>{}));
 try{while(true){const {value,done}=await reader.read();if(done)break;res.write(value);}res.end();}catch{res.end();}
});const port=Number(process.env.CAREFLOW_TEAM_PORT||8788);server.listen(port,'127.0.0.1',()=>process.stdout.write(`CareFlow shared-team preview: http://127.0.0.1:${port}\n`));
