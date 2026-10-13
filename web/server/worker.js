import {teamAPI} from './team-api.js';
import assets from '../.runtime/worker-assets.js';
export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(path.startsWith('/team-api/'))return teamAPI(request,env);
 if(path.startsWith('/api/'))return new Response('Use the shared team workspace.',{status:404});
 const entry=assets[path]||(!path.split('/').at(-1).includes('.')?assets['/index.html']:null);
 if(!entry)return new Response('Not found',{status:404});
 const bytes=Uint8Array.from(atob(entry.data),c=>c.charCodeAt(0));
 return new Response(bytes,{headers:{'Content-Type':entry.type,'Cache-Control':path.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});
}};
