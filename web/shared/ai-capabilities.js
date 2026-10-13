// Stable capability IDs and a provider-independent result contract.
export const AI_CONTRACT_VERSION=1;
export const aiCapabilities=[
 {id:'intake',name:'Read the referral',permission:'work.intake',before:'You read the request and type each detail.',after:'The demo reader fills a draft. You check it.',manual:8,review:2,rate:1},
 {id:'classify',name:'Sort the papers',permission:null,before:'You open each file and work out what it is.',after:'The demo labels the paper and checks the patient name.',manual:2,review:.5,rate:3},
 {id:'completeness',name:'Find what is missing',permission:'work.intake',before:'You search the papers for missing details.',after:'A checklist shows what is found and what is still needed.',manual:6,review:2,rate:1},
 {id:'request',name:'Ask for the missing paper',permission:'work.intake',before:'You write a new request and check each reply.',after:'A draft asks for the right paper. You review and copy it.',manual:5,review:1.5,rate:.3},
 {id:'authorization',name:'Prepare the insurance request',permission:'work.insurance',before:'You find the plan rules and gather the papers.',after:'The demo matches a sample rule to the papers and builds a draft.',manual:15,review:5,rate:.6},
 {id:'response',name:'Read the insurer reply',permission:'work.insurance',before:'You read the letter and type the answer.',after:'The demo finds the answer and reference. You check and save.',manual:5,review:1.5,rate:.6},
 {id:'handoff',name:'Catch up on the case',permission:null,before:'You read the whole case before taking your turn.',after:'A short brief shows what changed and your next job.',manual:4,review:1,rate:2},
 {id:'ask',name:'Ask Mira about the case',permission:null,before:'You search screens and papers for an answer.',after:'Mira finds the saved facts and shows where they came from.',manual:4,review:1,rate:1},
 {id:'denial',name:'Prepare a denied-claim reply',permission:'work.claims',before:'You read the rejection and collect papers again.',after:'The demo explains the saved reason and drafts a reply.',manual:12,review:5,rate:.1},
 {id:'followup',name:'Follow up and check the finish',permission:null,before:'You check old cases and write follow-ups by hand.',after:'The demo shows the hold-up, drafts a reminder, and checks the finish.',manual:5,review:2,rate:.3},
];
export const chicagoWages={medical:22.35,insurance:25.90,billing:25.01,source:'https://www.bls.gov/regions/midwest/news-release/2025/occupationalemploymentandwages_chicago_20250424.htm',period:'May 2024',area:'Chicago-Naperville-Elgin metro'};
export function monthlyEstimate(cap,{cases=200,manual=cap.manual,review=cap.review,rate=cap.rate,wage=cap.id==='denial'?chicagoWages.billing:['authorization','response'].includes(cap.id)?chicagoWages.insurance:chicagoWages.medical}={}){
 const values=[cases,manual,review,rate,wage].map(Number);if(values.some(v=>!Number.isFinite(v)||v<0)||cases>100000||manual>120||review>120||rate>20||wage>500)throw new Error('Use valid estimate inputs.');
 const hours=Number(cases)*Number(rate)*Math.max(0,Number(manual)-Number(review))/60;
 return {hours,money:hours*Number(wage),tasks:Number(cases)*Number(rate),wage:Number(wage)};
}
