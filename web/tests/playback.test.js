import { test } from "node:test";
import assert from "node:assert/strict";
import { guideOperations, createPlaybackClock, narrationDuration } from "../src/guide-playback.js";
import { guideSteps, productAnswer } from "../src/guide-content.js";
test("Pause invalidates every old action even if a delayed callback arrives later", () => {
 const callbacks=[]; const clock=createPlaybackClock(fn=>{callbacks.push(fn);return callbacks.length;},()=>{}); let mutations=0;
 clock.delay(1,()=>mutations++); clock.delay(2,()=>mutations++); clock.cancel(); callbacks.forEach(fn=>fn()); assert.equal(mutations,0);
 clock.delay(3,()=>mutations++); callbacks.at(-1)(); assert.equal(mutations,1);
});
test("every guide stop has an operation and explanations do not use a fixed five-second timer",()=>{
 assert.equal(guideOperations.length,guideSteps.length);
 assert.ok(narrationDuration(guideSteps[1].text)>10000);
 assert.ok(narrationDuration(guideSteps[1].text,true)>5000);
 assert.match(guideOperations[1].detail,/sample email/);
 assert.match(productAnswer("How does a case start?"),/coordinator/);
 assert.match(productAnswer("How does booking work?"),/proposal is not an appointment/);
 assert.match(productAnswer("What is your pricing?"),/beyond the verified demo/);
});
