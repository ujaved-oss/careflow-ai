export const clinicalSequence = ["PREVISIT_REVIEW", "READY", "SERVICE_COMPLETED", "REPORT_FINAL", "COMMUNICATION_COMPLETE"];
const clinicalLabels = { PREVISIT_REVIEW: "Check before the visit", READY: "Mark ready for the visit", SERVICE_COMPLETED: "Mark the visit finished", REPORT_FINAL: "Finish the report", COMMUNICATION_COMPLETE: "Confirm the report was shared" };
export function nextClinical(c) {
  return clinicalSequence[clinicalSequence.indexOf(c.clinical_status) + 1];
}
export function caseActions(c, role, approvals = [], documents = []) {
  if (c.overall_status === "FULLY_RESOLVED") return [];
  if (role === "clinician") {
    const next = nextClinical(c);
    if (!next || !["CONFIRMED", "SCHEDULED", "COMPLETED"].includes(c.scheduling_status)) return [];
    if (next === "REPORT_FINAL" && !documents.some(d => d.type === "final_report" && d.verification_status === "VERIFIED")) return [];
    return [[`clinical:${next}`, clinicalLabels[next]]];
  }
  if (role !== "demo_admin") return [];
  const pending = type => approvals.some(a => a.action_type === type && a.status === "AWAITING_APPROVAL");
  if (pending("appointment_booking") || pending("case_closure")) return [];
  if (c.document_status !== "COMPLETE") return [["document_received", "Receive the doctor's note"]];
  if (!["APPROVED", "NOT_REQUIRED"].includes(c.authorization_status)) return [["authorization_approved", "Add sample insurance approval"]];
  if (!["CONFIRMED", "SCHEDULED", "COMPLETED"].includes(c.scheduling_status)) return [["appointment", "Choose an appointment"]];
  if (c.clinical_status === "SERVICE_COMPLETED" && !documents.some(d => d.type === "final_report" && d.verification_status === "VERIFIED")) return [["final_report", "Add and check the sample report"]];
  if (c.clinical_status !== "COMMUNICATION_COMPLETE") return [];
  if (c.financial_status === "NOT_STARTED") return [["claim_submitted", "Send the sample bill"]];
  if (c.financial_status === "SUBMITTED") return [["claim_paid", "Mark the sample bill paid"]];
  if (c.financial_status === "PAID") return [["closure", "Check and close the case"]];
  return [];
}
export function handoffHint(c, approvals = [], documents = []) {
  if (c.overall_status === "FULLY_RESOLVED") return "Journey complete. The evidence and timeline remain available.";
  if (approvals.some(a => a.status === "AWAITING_APPROVAL")) return "Review the prepared proposal. Preparing a booking does not confirm an appointment.";
  if (["CONFIRMED", "SCHEDULED", "COMPLETED"].includes(c.scheduling_status) && c.clinical_status !== "COMMUNICATION_COMPLETE") {
    if (c.clinical_status === "SERVICE_COMPLETED" && !documents.some(d => d.type === "final_report" && d.verification_status === "VERIFIED")) return "Coordinator: add the sample final report. Then the clinician records report finalization.";
    return `Next: ${clinicalLabels[nextClinical(c)] || "finish the care checks"}. Choose the care-team profile below.`;
  }
  return "Each action advances one lane. The next available handoff updates after it completes.";
}
