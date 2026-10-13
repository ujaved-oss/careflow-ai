import {readdir,readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {resolve,relative,extname} from 'node:path';
import {build} from 'esbuild';
const root=process.cwd(),dist=resolve(root,'dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.txt':'text/plain; charset=utf-8'};
const assets={};
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(['server','.openai','drizzle'].includes(entry.name))continue;const p=resolve(dir,entry.name);if(entry.isDirectory())await walk(p);else assets['/'+relative(dist,p).replaceAll('\\','/')]={data:(await readFile(p)).toString('base64'),type:types[extname(p)]||'application/octet-stream'};}}
await walk(dist);await mkdir(resolve(root,'.runtime'),{recursive:true});await writeFile(resolve(root,'.runtime/worker-assets.js'),`export default ${JSON.stringify(assets)};`);
await mkdir(resolve(dist,'server'),{recursive:true});await build({entryPoints:['server/worker.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,outfile:'dist/server/index.js'});
await mkdir(resolve(dist,'.openai'),{recursive:true});await cp('.openai/hosting.json','dist/.openai/hosting.json');await cp('drizzle','dist/drizzle',{recursive:true});
console.log(`Shared-team Worker built with ${Object.keys(assets).length} embedded assets and D1 migrations.`);
