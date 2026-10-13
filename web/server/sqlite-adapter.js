import {DatabaseSync} from 'node:sqlite';
export function sqliteBinding(path=':memory:'){
 const database=new DatabaseSync(path);database.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
 return {database,prepare(sql){let values=[];const api={bind(...args){values=args;return api;},async first(){return database.prepare(sql).get(...values)||null;},async run(){const result=database.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}};}};return api;}};
}
