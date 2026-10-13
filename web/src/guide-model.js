// Kept in sync with the guided chapter list by the tests.
export const GUIDE_LENGTH = 26;
export const viewerPersona = {
  id: "viewer",
  name: "Client viewer",
  role: "viewer",
  tenant_id: "tour",
  hospital_name: "CareFlow Demo Hospital",
};
const clinical = [
  "PREVISIT_REVIEW",
  "READY",
  "SERVICE_COMPLETED",
  "REPORT_FINAL",
  "COMMUNICATION_COMPLETE",
];
// Deterministic browser-only checkpoints make Back, Resume and Replay idempotent.
// This model never calls the local API or executes an external integration.
export function buildGuideState(index = 0, startedAt = Date.now()) {
  if (!Number.isInteger(index) || index < 0 || index >= GUIDE_LENGTH)
    throw new Error("Unknown demo chapter.");
  const s = {
    users: [viewerPersona],
    cases: [],
    documents: [],
    approvals: [],
    tasks: [],
    events: [],
    appointments: [],
    guideIndex: index,
    startedAt,
  };
  const timestamp = (step) => new Date(startedAt + step * 60000).toISOString();
  const sampleVisit = new Date(startedAt);
  sampleVisit.setDate(sampleVisit.getDate() + 1);
  sampleVisit.setHours(9, 0, 0, 0);
  const event = (step, type, source) =>
    s.events.push({
      id: `tour-event-${step}-${s.events.length}`,
      case_id: "guide-case",
      event_type: type,
      source,
      created_at: timestamp(step),
    });
  const document = (step, type, title, text) => {
    s.documents.push({
      id: `tour-${type}`,
      case_id: "guide-case",
      type,
      title,
      filename: {order:'mri-order.pdf',physician_note:'doctor-note.pdf',final_report:'mri-report.pdf'}[type],
      text,
      verification_status: "VERIFIED",
      indexed: true,
      version: 1,
    });
    event(step, "DocumentVerified", "Simulated document coordinator");
  };
  const propose = (step, action_type, proposed_payload) => {
    s.approvals.push({
      id: `tour-proposal-${step}`,
      case_id: "guide-case",
      action_type,
      proposed_payload,
      status: "AWAITING_APPROVAL",
      risk_level: "LOW",
      required_approver_role: ["demo_admin"],
      target_system: "Browser simulation",
      created_at: timestamp(step),
    });
    event(step, "ProposalPrepared", "Simulated workflow assistant");
  };
  const approve = (step) => {
    const a = s.approvals.findLast((a) => a.status === "AWAITING_APPROVAL");
    if (!a) throw new Error("A proposal must exist before review.");
    a.status = "COMPLETED";
    a.decision_note =
      "Reviewed by the fictional coordinator in Mira's browser tour";
    event(step, "HumanApprovalRecorded", "Simulated coordinator approval");
  };
  for (let step = 1; step <= index; step++) {
    const c = s.cases[0];
    if (step === 1) {
      s.cases.push({
        id: "guide-case",
        patient_id: "tour-patient",
        patient_name: "Amelia Hart",
        case_number: "CF-DEMO-1041",
        external_reference: "SYN-EMAIL-1041",
        priority: "HIGH",
        scenario: "missing_note",
        service_line: "OUTPATIENT_MRI",
        overall_status: "NEEDS_ATTENTION",
        referral_status: "VALIDATED",
        document_status: "MISSING",
        insurance_status: "VERIFIED",
        authorization_status: "PENDING",
        scheduling_status: "NOT_SCHEDULED",
        clinical_status: "PENDING",
        financial_status: "NOT_STARTED",
        version: 1,
        created_at: timestamp(step),
      });
      event(step, "ReferralReceived", "Simulated intake team");
      document(
        step,
        "order",
        "MRI referral order",
        "Fictional MRI brain order for Amelia Hart. Procedure 70551. Intended location SYN-MRI-A. Sample record only; not a clinical instruction.",
      );
    }
    if (step === 2) {
      s.tasks.push({
        id: "tour-task",
        case_id: c.id,
        task_type: "document_review",
        status: "OPEN",
        priority: "HIGH",
        owner: "Alex Morgan",
      });
      event(step, "DocumentGapIdentified", "Simulated document review");
    }
    if (step === 4)
      propose(step, "request_missing_document", {
        recipient: "Fictional referring practice",
        document_type: "physician_note",
        message:
          "Please send Amelia's doctor's note.",
      });
    if (step === 5) approve(step);
    if (step === 6) {
      document(
        step,
        "physician_note",
        "Physician supporting note",
        "Fictional supporting note received from the sample referring practice. Administrative demonstration only. No real patient information or clinical advice.",
      );
      c.document_status = "COMPLETE";
      c.overall_status = "AUTHORIZATION_PENDING";
      c.version++;
      s.tasks[0].status = "COMPLETED";
      event(step, "TeamTaskCompleted", "Simulated coordinator");
    }
    if (step === 7) {
      if (c.document_status !== "COMPLETE")
        throw new Error("Authorization needs complete documents.");
      propose(step, "authorization_submission", {
        recipient: "Sample insurance company",
        message:
          "Send the sample MRI order and checked doctor's note to insurance.",
        supporting_documents: "MRI order / Doctor's note",
      });
    }
    if (step === 8) {
      approve(step);
      c.authorization_status = "SUBMITTED";
      c.version++;
      event(step, "AuthorizationSubmitted", "Simulated payer integration");
    }
    if (step === 9) {
      c.authorization_reference = "AUTH-DEMO-1041";
      c.authorization_status = "APPROVED";
      c.overall_status = "READY_TO_SCHEDULE";
      c.version++;
      event(step, "AuthorizationApproved", "Simulated payer response");
    }
    if (step === 11) {
      if (
        c.document_status !== "COMPLETE" ||
        c.authorization_status !== "APPROVED"
      )
        throw new Error("Booking needs administrative readiness.");
      propose(step, "appointment_booking", {
        scheduled_at: sampleVisit.toISOString(),
        location: "Sample MRI room A",
        patient: "Amelia Hart",
      });
    }
    if (step === 12) {
      approve(step);
      c.scheduling_status = "CONFIRMED";
      c.overall_status = "SCHEDULED";
      c.version++;
      s.appointments.push({
        id: "tour-appointment",
        case_id: c.id,
        scheduled_at: sampleVisit.toISOString(),
        location: "Sample MRI room A",
        status: "CONFIRMED",
      });
      event(step, "AppointmentConfirmed", "Simulated scheduler");
    }
    const milestone = {
      14: clinical[0],
      15: clinical[1],
      16: clinical[2],
      18: clinical[3],
      19: clinical[4],
    }[step];
    if (milestone) {
      const prior = clinical.indexOf(milestone) - 1;
      if (prior >= 0 && c.clinical_status !== clinical[prior])
        throw new Error("Care-team steps must stay in sequence.");
      if (
        milestone === "REPORT_FINAL" &&
        !s.documents.some(
          (d) =>
            d.type === "final_report" && d.verification_status === "VERIFIED",
        )
      )
        throw new Error("Finalization needs a verified report.");
      c.clinical_status = milestone;
      if (milestone === "COMMUNICATION_COMPLETE") c.communication_message = "Amelia's report is ready.";
      c.version++;
      if (milestone === "SERVICE_COMPLETED") {
        c.scheduling_status = "COMPLETED";
        s.appointments[0].status = "COMPLETED";
      }
      event(step, milestone, "Simulated qualified clinician");
    }
    if (step === 17)
      document(
        step,
        "final_report",
        "Synthetic final MRI report",
        "Final-report demonstration fixture. This is not an MRI interpretation, medical advice, or a real patient's report. Used only to demonstrate evidence and milestone tracking.",
      );
    if (step === 20) {
      if (c.clinical_status !== "COMMUNICATION_COMPLETE")
        throw new Error("Clinical communication remains incomplete.");
      c.financial_status = "SUBMITTED";
      c.bill_reference = "CLAIM-DEMO-1041";
      c.version++;
      event(step, "ClaimSubmitted", "Simulated billing team");
    }
    if (step === 21) {
      if (c.financial_status !== "SUBMITTED")
        throw new Error("Payment needs a submitted claim.");
      c.financial_status = "PAID";
      c.version++;
      event(step, "ClaimPaid", "Simulated payer response");
    }
    if (step === 22) {
      if (
        c.clinical_status !== "COMMUNICATION_COMPLETE" ||
        c.financial_status !== "PAID"
      )
        throw new Error("Required closure milestones are incomplete.");
      propose(step, "case_closure", {
        disposition: "FULLY_RESOLVED",
        reason:
          "Fictional clinical communication and financial follow-up are complete.",
      });
    }
    if (step === 23) {
      approve(step);
      c.overall_status = "FULLY_RESOLVED";
      c.version++;
      event(step, "CaseFullyResolved", "Simulated coordinator");
    }
  }
  return s;
}
export function guideMetrics(state) {
  return [
    {
      label: "Case closed",
      value: state.cases.filter((c) => c.overall_status === "FULLY_RESOLVED")
        .length,
      definition:
        "The report was shared, the sample bill was paid, and Alex checked that the case could close.",
    },
    {
      label: "Actions reviewed",
      value: state.approvals.filter((a) => a.status === "COMPLETED").length,
      definition:
        "Alex checked four sample actions: asking for the note, sending the insurance request, booking the visit and closing the case.",
    },
    {
      label: "Papers checked",
      value: state.documents.filter((d) => d.verification_status === "VERIFIED")
        .length,
      definition:
        "The MRI order, doctor's note and final report. You can inspect each sample paper.",
    },
    {
      label: "Care-team steps",
      value: state.events.filter((e) => clinical.includes(e.event_type)).length,
      definition:
        "Five sample care-team steps: check before the visit, mark ready, finish the visit, finish the report and confirm it was shared.",
    },
    {
      label: "Tasks left",
      value: state.tasks.filter((t) => t.status === "OPEN").length,
      definition:
        "Work still waiting for the team. The missing-note task finished when Alex checked the doctor's note.",
    },
    {
      label: "History entries",
      value: state.events.length,
      definition:
        "The history records changes, requests and checks. One action can add more than one entry. This does not measure time saved.",
    },
  ];
}
