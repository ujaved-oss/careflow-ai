// Short, plain-language narration for a fictional case.
export const guideSteps = [
  {
    "title": "Start with an empty desk",
    "chapter": "Welcome",
    "view": "empty",
    "actor": "Your guide",
    "text": "Hi, I'm Mira. Let's help Amelia get her MRI. We'll start with a doctor's request and finish when the visit, report and bill are all checked.",
    "takeaway": "One case. Every handoff. Nothing to remember.",
    "feature": "An isolated, read-only viewer workspace"
  },
  {
    "title": "A doctor asks for an MRI",
    "chapter": "Intake",
    "view": "intake",
    "actor": "Front desk",
    "text": "A doctor's office sends a sample email with Amelia's MRI order. The front desk checks her details and creates a case. A paper order or hospital system could start it too.",
    "takeaway": "A shared case replaces disconnected handoffs.",
    "feature": "Patient identity, priority, ownership and independent statuses"
  },
  {
    "title": "One paper is missing",
    "chapter": "Documents",
    "view": "documents",
    "actor": "Office team",
    "text": "We have the MRI order, but we need the doctor's note. CareFlow shows what is missing and gives Alex a task to collect it.",
    "takeaway": "Missing evidence becomes an owned next step.",
    "feature": "Document verification, versions and team tasks"
  },
  {
    "title": "Ask what is holding things up",
    "chapter": "Documents",
    "view": "assistant",
    "actor": "Staff assistant",
    "text": "Staff can ask CareFlow Copilot about this case. It says the doctor's note is missing and links to the paper it checked. You can open that link.",
    "takeaway": "An answer is useful when you can inspect its source.",
    "feature": "Case questions with clickable source references"
  },
  {
    "title": "Ask for the missing note",
    "chapter": "Review",
    "view": "proposal",
    "actor": "Office team",
    "text": "CareFlow writes a request for the note. Alex checks the message before it goes anywhere. In this demo, no real email is sent.",
    "takeaway": "Preparation happens before permission.",
    "feature": "Human review, approval, rejection and an audit note"
  },
  {
    "title": "A person checks the request",
    "chapter": "Review",
    "view": "approval-done",
    "actor": "Office team",
    "text": "Alex approves the request. We keep a record of who checked it. The assistant prepares the work; a person makes the decision.",
    "takeaway": "The decision and its actor remain visible.",
    "feature": "A recorded approval and a simulated external action"
  },
  {
    "title": "The note arrives",
    "chapter": "Documents",
    "view": "documents",
    "actor": "Office team",
    "text": "The sample note is here. Alex checks it and closes the task. The papers are ready, but we still need the insurance company's answer.",
    "takeaway": "Complete evidence clears one blocker, not every blocker.",
    "feature": "Received documents, completed tasks and updated readiness"
  },
  {
    "title": "Send the papers to insurance",
    "chapter": "Authorization",
    "view": "proposal",
    "actor": "Office team",
    "text": "CareFlow gathers the MRI order and doctor's note for the insurance company. Alex can see the papers before approving the sample submission.",
    "takeaway": "Evidence travels with the proposed action.",
    "feature": "Payer submission proposal with supporting documents"
  },
  {
    "title": "Check before sending",
    "chapter": "Authorization",
    "view": "approval-done",
    "actor": "Office team",
    "text": "Alex approves the insurance request. Sending a request is not the same as getting a yes. We now wait for the insurance company's answer.",
    "takeaway": "Submitted and approved are different states.",
    "feature": "Separate approval and payer status tracking"
  },
  {
    "title": "Insurance says yes",
    "chapter": "Authorization",
    "view": "journey",
    "actor": "Insurance company",
    "text": "The sample insurance company approves the MRI. The papers and insurance are ready. We can now look for an appointment. The care team still handles medical checks.",
    "takeaway": "Administrative readiness is separate from clinical readiness.",
    "feature": "Readiness checks and payer event handling"
  },
  {
    "title": "Find Amelia in the case list",
    "chapter": "Scheduling",
    "view": "queue",
    "actor": "Office team",
    "text": "Amelia now appears in the ready-to-book list. Staff can search for her, open the case and see exactly what comes next.",
    "takeaway": "The next team gets a clear, actionable queue.",
    "feature": "Search, filters, priority and the next best step"
  },
  {
    "title": "Choose an appointment",
    "chapter": "Scheduling",
    "view": "proposal",
    "actor": "Office team",
    "text": "Alex picks a sample time and place. This creates a booking request. The appointment is not confirmed until a person checks and approves it.",
    "takeaway": "A proposed slot is not a confirmed appointment.",
    "feature": "Appointment proposals with time and location"
  },
  {
    "title": "Confirm the appointment",
    "chapter": "Scheduling",
    "view": "approval-done",
    "actor": "Office team",
    "text": "Alex approves the time and place. Amelia now has one confirmed appointment. We move on to care checks instead of offering another booking.",
    "takeaway": "A reviewed booking becomes a visible commitment.",
    "feature": "Reviewed booking and confirmation"
  },
  {
    "title": "See the booked visit",
    "chapter": "Scheduling",
    "view": "schedule",
    "actor": "Office team",
    "text": "The appointment appears on the schedule. Everyone can see when and where Amelia's sample visit will happen. Booking is complete; the whole case is still open.",
    "takeaway": "Booked is the beginning of the next handoff.",
    "feature": "The schedule and appointment details"
  },
  {
    "title": "Check before the visit",
    "chapter": "Clinical",
    "view": "clinical",
    "actor": "Care team",
    "text": "A qualified clinician checks the case before the visit. We record that check. The assistant does not decide whether medical care is safe.",
    "takeaway": "Clinical accountability stays with qualified staff.",
    "feature": "Role-specific clinical attestations"
  },
  {
    "title": "The care team marks her ready",
    "chapter": "Clinical",
    "view": "clinical",
    "actor": "Care team",
    "text": "The clinician marks Amelia ready for the sample visit. This is a care-team decision, separate from the insurance and booking checks.",
    "takeaway": "The right person records the right milestone.",
    "feature": "Sequential clinical milestones and version awareness"
  },
  {
    "title": "The MRI visit is finished",
    "chapter": "Clinical",
    "view": "clinical",
    "actor": "Care team",
    "text": "The clinician records that the sample MRI visit is finished. The appointment is complete. We still need the final report and follow-up.",
    "takeaway": "Service completion does not skip the report.",
    "feature": "Service milestones linked to the appointment"
  },
  {
    "title": "Add the report",
    "chapter": "Clinical",
    "view": "documents",
    "actor": "Office team",
    "text": "The office adds and checks a made-up report. Staff can open its source. The care team still needs to mark the report final.",
    "takeaway": "The report has a source and a verification state.",
    "feature": "Final-report evidence and document inspection"
  },
  {
    "title": "The care team finishes the report",
    "chapter": "Clinical",
    "view": "clinical",
    "actor": "Care team",
    "text": "The clinician marks the checked report final. CareFlow records the step. This demo does not read an MRI or give medical advice.",
    "takeaway": "A verified report supports an accountable attestation.",
    "feature": "Evidence requirements and qualified-staff ownership"
  },
  {
    "title": "Tell the referring doctor",
    "chapter": "Clinical",
    "view": "clinical",
    "actor": "Care team",
    "text": "The care team confirms that the referring doctor has received the report. That closes the care follow-up. The bill is tracked separately.",
    "takeaway": "Clinical completion and financial completion are independent.",
    "feature": "Communication milestones and a closed referral loop"
  },
  {
    "title": "Send the sample bill",
    "chapter": "Financial",
    "view": "financial",
    "actor": "Billing team",
    "text": "The billing team submits a sample claim to insurance. Care is complete, but the case stays open while billing waits for an answer.",
    "takeaway": "The financial lane keeps unfinished work visible.",
    "feature": "Claim submission and financial follow-up"
  },
  {
    "title": "Mark the sample bill paid",
    "chapter": "Financial",
    "view": "financial",
    "actor": "Insurance company",
    "text": "A sample insurance response marks the bill paid. No real money moves. Care and billing are now both complete.",
    "takeaway": "A recorded payment completes financial follow-up.",
    "feature": "Payment events and independent financial status"
  },
  {
    "title": "Check everything before closing",
    "chapter": "Resolution",
    "view": "proposal",
    "actor": "Office team",
    "text": "CareFlow checks that the report was shared and the bill was paid. It prepares a closing request for Alex to review.",
    "takeaway": "Closure is a reviewed disposition, not a guess.",
    "feature": "Guarded closure and separate resolution dispositions"
  },
  {
    "title": "Close Amelia’s case",
    "chapter": "Resolution",
    "view": "approval-done",
    "actor": "Office team",
    "text": "Alex approves the final check. Amelia's case is now fully closed. The papers, decisions and history stay available for the team.",
    "takeaway": "One resolved case, with the evidence still attached.",
    "feature": "Reviewed closure and a fully resolved case"
  },
  {
    "title": "See what happened",
    "chapter": "Resolution",
    "view": "timeline",
    "actor": "Office team",
    "text": "The history shows every recorded step, from the first request to closure. Staff can see what happened and who handled each part.",
    "takeaway": "Every handoff has a traceable story.",
    "feature": "Read-only viewer access and the event timeline"
  },
  {
    "title": "Understand the results",
    "chapter": "Results",
    "view": "insights",
    "actor": "Your guide",
    "text": "One case is closed. Four actions were reviewed. Three papers were checked. The care team recorded five steps. Let's open the sheet and explain every number.",
    "takeaway": "Evidence first. Numbers with definitions.",
    "feature": "Workflow insights, result definitions and a downloadable sheet"
  }
];

export const productQuestions = [
  {
    question: "What problem does CareFlow solve?",
    answer:
      "It brings referrals, documents, payer status, scheduling, clinical milestones and financial follow-up into one case. Teams can see the blocker, the owner and the next handoff instead of piecing the journey together across disconnected updates.",
  },
  {
    question: "What can the staff assistant do?",
    answer:
      "CareFlow Copilot explains case status and missing evidence, with case and document references you can inspect. The current backend uses deterministic demo answers; the hosted presentation uses scripted answers. A live language-model service has not been connected or validated in this delivery.",
  },
  {
    question: "Does AI make clinical decisions?",
    answer:
      "No. Qualified staff record clinical attestations. Administrative readiness, such as complete documents and payer approval, does not establish clinical clearance. The guide demonstrates fictional clinician actions; it does not assess a patient.",
  },
  {
    question: "Can it send messages or book automatically?",
    answer:
      "The workflow prepares proposed external actions for authorized human review. This demonstration uses simulated messages, payer responses and bookings. The local backend executes mock integrations after approval; live hospital, messaging and payer connections need implementation and validation.",
  },
  {
    question: "What if information is missing or a payer says no?",
    answer:
      "The queue and case readiness keep the blocker visible. Staff can review the evidence, follow up, reject a proposal or escalate the case. The tour follows one successful missing-note scenario. It does not imply that an assistant can overturn a payer decision or bypass a clinical requirement.",
  },
  {
    question: "How do access and approvals work?",
    answer:
      "The connected demo enforces hospital-scoped records and role permissions in the backend. The viewer tour is isolated browser sample data with read-only inspection. A demo persona selector is not production authentication. Security, compliance and real deployment controls need a separate production review.",
  },
  {
    question: "Are these real results or time savings?",
    answer:
      "They are counts from one simulated case, not measured hospital outcomes. The sheet shows the underlying definitions. It makes no claim about faster care, hours saved, revenue gained or regulatory certification.",
  },
  {
    question: "Is this ready for real patient data?",
    answer:
      "This delivery is a synthetic demonstration. Production use requires real authentication, validated integrations, operational monitoring, security and privacy reviews, and the hospital's clinical and deployment approvals. Do not put real patient information into this demo.",
  },
];

export function productAnswer(question) {
  const q = question.toLowerCase();
  const outside =
    "That question goes beyond the verified demo. I can explain this workflow, its sample numbers, the staff assistant, approvals and the current deployment limits. Your presenter can discuss a hospital's specific integration, pricing, compliance or clinical requirements.";
  if (
    /\b(pricing|price|cost|quote|buy|contract|sla|guarantee|prescribe|diagnose|dosage|dose)\b/.test(
      q,
    )
  )
    return outside;
  if (/intake|start|data|email|paper|fax|receiv|creat|new case|referral/.test(q)) return "A doctor's request starts the case. It could arrive by email, fax, paper, the hospital system or reception. The coordinator checks the patient, order and insurance. In this demo, those sources and patients are made up. Choose the coordinator profile, then New case, to try it. Viewer mode lets you watch and explore.";
  if (/booking|appointment|schedule/.test(q)) return "First, collect the papers and insurance approval. Then choose a slot. A proposal is not an appointment: Alex must approve it. Once booked, the next step moves to the care team. They record the visit and report. The billing team checks the bill, then Alex reviews closure.";
  let index = /clinical|diagnos|treat|medical/.test(q)
    ? 2
    : /staff|copilot|bot|language|llm|assistant/.test(q)
      ? 1
      : /send|book|automatic|integrat|ehr|whatsapp/.test(q)
        ? 3
        : /missing|deni|deny|reject|exception/.test(q)
          ? 4
          : /access|secur|permission|approv|hospital|hipaa|complian/.test(q)
            ? 5
            : /saving|result|number|revenue|time|roi/.test(q)
              ? 6
              : /real patient|production|ready|deploy/.test(q)
                ? 7
                : /problem|solve|what.*careflow|product|feature/.test(q)
                  ? 0
                  : -1;
  return index < 0 ? outside : productQuestions[index].answer;
}
