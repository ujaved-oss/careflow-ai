const operation = (label, detail, target, fields = []) => ({ label, detail, target, fields });
export const guideOperations = [
 operation("Open a clean workspace", "No cases have been created.", "workspace"),
 operation("Create a case from the doctor's request", "The front desk checks the sample email, matches Amelia and saves her MRI order.", "intake", [["From", "Fictional referring practice"], ["Patient", "Amelia Hart"], ["Order", "MRI brain / 70551"], ["Source", "referral-order.pdf / verified"]]),
 operation("Check the papers", "We have the order. Alex gets a task to collect the doctor's note.", "documents", [["Order", "Present"], ["Supporting note", "Missing"], ["Owner", "Alex Morgan"]]),
 operation("Open CareFlow Copilot", "Inspect the case answer and its original source reference.", "assistant"),
 operation("Ask for the missing note", "Draft a message for the referring practice. Hold it for review.", "proposal", [["To", "Fictional referring practice"], ["Request", "Physician supporting note"], ["Decision", "Awaiting review"]]),
 operation("Alex checks the request", "Simulate the coordinator approving the note request. Record the review without sending real mail.", "approval", [["Actor", "Fictional coordinator"], ["Decision", "Approved"]]),
 operation("Receive and check the doctor's note", "Link the returned sample note and close the owned follow-up task.", "documents"),
 operation("Prepare the insurance request", "Gather the order and doctor's note. Alex will check before sending.", "proposal"),
 operation("Alex checks the insurance request", "Alex approves the sample request. We still need an answer from insurance.", "approval"),
 operation("Insurance says yes", "The sample approval arrives. We can now book the visit.", "authorization"),
 operation("Find Amelia in the case list", "Use the list to find the case that is ready to book.", "queue"),
 operation("Choose a sample appointment", "Select a sample slot and location. Create a proposal, without confirming it yet.", "proposal", [["Patient", "Amelia Hart"], ["Location", "Synthetic MRI location A"], ["Booking", "Awaiting review"]]),
 operation("Review and confirm the booking", "The fictional coordinator approves the slot. Store one confirmed appointment.", "approval", [["Decision", "Approved"], ["Appointment", "Confirmed"]]),
 operation("Open the schedule", "Inspect the confirmed appointment. Booking remains complete while clinical work continues.", "schedule"),
 operation("Check before the visit", "The sample care team records the before-visit check.", "clinical"),
 operation("Mark ready for the visit", "The care team records readiness. They make the medical decision.", "clinical"),
 operation("Mark the visit finished", "The care team records that the sample MRI visit is finished.", "clinical"),
 operation("Receive the final report", "Attach and verify the fictional report before finalization.", "documents"),
 operation("Finish the report", "The sample care team finishes the checked report.", "clinical"),
 operation("Confirm the doctor received the report", "The care team records that the report was shared with the doctor's office.", "clinical"),
 operation("Send the sample bill", "The billing team records the sample insurance bill. No real bill is sent.", "financial"),
 operation("Mark the sample bill paid", "The sample bill is marked paid. No money moves.", "financial"),
 operation("Check everything before closing", "Check that the report was shared and the bill was paid. Ask Alex to review closure.", "proposal"),
 operation("Close Amelia's case", "Alex checks the sample case and marks it closed.", "approval"),
 operation("Inspect the complete timeline", "Show the actual events produced by this simulated case.", "timeline"),
 operation("Explain the results", "Calculate the counts from this case and open their definitions.", "results"),
];
export function narrationDuration(text, quick = false) {
  return Math.max(7000, Math.min(28000, text.trim().split(/\s+/).length * (quick ? 190 : 330)));
}
// Every scheduled callback belongs to one run; Pause invalidates all callbacks.
export function createPlaybackClock(schedule = setTimeout, unschedule = clearTimeout) {
  let generation = 0;
  const timers = new Set();
  return {
    delay(ms, fn) { const run = generation; const timer = schedule(() => { timers.delete(timer); if (run === generation) fn(); }, ms); timers.add(timer); return timer; },
    cancel() { generation++; for (const timer of timers) unschedule(timer); timers.clear(); },
  };
}
