// Return only the note actually cited by a completed, conflict-free checklist.
// A UI example must never create the evidence that the checklist says is missing.
export function supportingNoteFromRun(run){
 const o=run?.output;
 if(o?.capability!=='completeness'||o.decision!=='review'||!o.checks?.length||o.checks.some(c=>c.status!=='found'))return null;
 const source=o.evidence?.find(e=>run.document_ids?.includes(e.source_id)&&/^(Supporting note|Clinical note):\s*\S/i.test(e.quote));
 return source?source.quote.slice(source.quote.indexOf(':')+1).trim():null;
}
