// Local development talks to the existing PostgreSQL-backed API through Vite.
// The hosted presentation is an explicitly labelled, browser-local simulation.
import { buildGuideState, viewerPersona } from "./guide-model.js";
export let viewerMode =
  sessionStorage.getItem("careflow-viewer-mode") === "true";
export let connected = import.meta.env.DEV && !viewerMode;
const key = "careflow-presentation-v1";
const names = [
  "Amelia Hart",
  "Theo Bennett",
  "Nora Ellis",
  "Isaac Reed",
  "Maya Brooks",
  "Oliver Wells",
];
const scenarios = [
  "missing_note",
  "normal",
  "payer_timeout",
  "invalid_order",
  "ambiguous_identity",
  "not_required",
];
const statuses = [
  "NEEDS_ATTENTION",
  "READY_TO_SCHEDULE",
  "AUTHORIZATION_PENDING",
  "NEEDS_ATTENTION",
  "NEEDS_ATTENTION",
  "SCHEDULED",
];
const id = () => crypto.randomUUID();
function fresh() {
  const users = [
    {
      id: "coordinator",
      name: "Alex Morgan",
      role: "demo_admin",
      tenant_id: "north",
    },
    {
      id: "clinician",
      name: "Dr. Eliza Ward",
      role: "clinician",
      tenant_id: "north",
    },
  ];
  const cases = names.map((name, i) => ({
    id: `case-${i}`,
    patient_id: `patient-${i}`,
    patient_name: name,
    case_number: `CF-2026-${String(1041 + i)}`,
    priority: i === 0 ? "HIGH" : "NORMAL",
    scenario: scenarios[i],
    service_line: "OUTPATIENT_MRI",
    overall_status: statuses[i],
    referral_status: "VALIDATED",
    document_status: i === 0 ? "MISSING" : "COMPLETE",
    insurance_status: "VERIFIED",
    authorization_status:
      i === 1 ? "APPROVED" : i === 5 ? "NOT_REQUIRED" : "PENDING",
    scheduling_status: i === 5 ? "SCHEDULED" : "NOT_SCHEDULED",
    clinical_status: "PENDING",
    financial_status: "NOT_STARTED",
    version: 1,
    created_at: new Date().toISOString(),
  }));
  const documents = cases.flatMap((c) => [
    {
      id: `order-${c.id}`,
      case_id: c.id,
      type: "order",
      title: "MRI referral order",
      verification_status: "VERIFIED",
      version: 1,
      indexed: true,
      text: "Synthetic MRI brain referral. Procedure 70551. Location SYN-MRI-A. Administrative demonstration only.",
    },
    ...(c.scenario === "missing_note"
      ? []
      : [
          {
            id: `note-${c.id}`,
            case_id: c.id,
            type: "physician_note",
            title: "Physician supporting note",
            verification_status: "VERIFIED",
            version: 1,
            indexed: true,
            text: "Synthetic physician supporting note for MRI referral. Demonstration record only.",
          },
        ]),
  ]);
  const approvals = [
    {
      id: "proposal-1",
      case_id: "case-0",
      action_type: "request_missing_document",
      status: "AWAITING_APPROVAL",
      risk_level: "LOW",
      proposed_payload: {
        document_type: "physician_note",
        recipient: "Referring practice",
        message:
          "Please provide the physician supporting note for the synthetic MRI referral.",
      },
      required_approver_role: ["demo_admin"],
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    },
    {
      id: "proposal-2",
      case_id: "case-2",
      action_type: "payer_follow_up",
      status: "AWAITING_APPROVAL",
      risk_level: "LOW",
      proposed_payload: {
        recipient: "Synthetic payer",
        message: "Request an update on the pending MRI authorization.",
      },
      required_approver_role: ["demo_admin"],
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    },
  ];
  return {
    users,
    cases,
    documents,
    approvals,
    tasks: [
      {
        id: "task-1",
        case_id: "case-0",
        task_type: "document_review",
        status: "OPEN",
        priority: "HIGH",
      },
      {
        id: "task-2",
        case_id: "case-2",
        task_type: "administrative_follow_up",
        status: "OPEN",
        priority: "NORMAL",
      },
    ],
    events: cases.map((c) => ({
      id: id(),
      case_id: c.id,
      event_type: "ReferralReceived",
      source: "Synthetic EHR",
      created_at: new Date().toISOString(),
    })),
    appointments: [
      {
        id: "appointment-1",
        case_id: "case-5",
        scheduled_at: new Date(Date.now() + 86400000).toISOString(),
        location: "SYN-MRI-A",
        status: "SCHEDULED",
      },
    ],
  };
}
let state, presentationState;
try {
  state = JSON.parse(localStorage.getItem(key)) || fresh();
} catch {
  state = fresh();
}
presentationState = state;
if (viewerMode) {
  try {
    const saved = JSON.parse(localStorage.getItem("careflow-viewer-v1"));
    state = buildGuideState(
      saved?.guideIndex || 0,
      saved?.startedAt || Date.now(),
    );
  } catch {
    state = buildGuideState();
  }
}
const save = () =>
  localStorage.setItem(
    viewerMode ? "careflow-viewer-v1" : key,
    JSON.stringify(state),
  );
export let token = sessionStorage.getItem("careflow-session") || "";
export function logout() {
  token = "";
  sessionStorage.removeItem("careflow-session");
  sessionStorage.removeItem("careflow-persona");
  sessionStorage.removeItem("careflow-viewer-mode");
  if (viewerMode) state = presentationState;
  viewerMode = false;
  connected = import.meta.env.DEV;
}
export function enterViewer() {
  if (!viewerMode) presentationState = state;
  viewerMode = true;
  connected = false;
  state = buildGuideState();
  token = "presentation:viewer";
  sessionStorage.setItem("careflow-viewer-mode", "true");
  sessionStorage.setItem("careflow-session", token);
  sessionStorage.setItem("careflow-persona", JSON.stringify(viewerPersona));
  save();
  return viewerPersona;
}
export function viewerCheckpoint(index) {
  if (!viewerMode)
    throw new Error("The guide runs only in its isolated viewer simulation.");
  state = buildGuideState(index, state.startedAt);
  save();
  return state;
}
export function viewerState() {
  return viewerMode ? structuredClone(state) : null;
}
export async function request(path, body, method = body ? "POST" : "GET") {
  if (connected) {
    const response = await fetch(`/api/v1${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      let msg = `Request failed (${response.status})`;
      try {
        const error = await response.json();
        msg = typeof error.detail === "string" ? error.detail : msg;
      } catch {}
      throw new Error(msg);
    }
    return response.json();
  }
  // No external system is contacted by presentation actions.
  await new Promise((r) => setTimeout(r, viewerMode ? 20 : 180));
  const url = new URL(path, "https://demo.local"),
    p = url.pathname;
  if (p === "/auth/demo-users") return state.users;
  if (p === "/auth/demo-login") {
    const user = state.users.find((u) => u.id === body.user_id);
    if (!user) throw new Error("Choose a demo persona.");
    return { access_token: `presentation:${user.id}`, synthetic: true };
  }
  if (!token) throw new Error("Please sign in to the demo.");
  if (viewerMode && method !== "GET" && p !== "/assistant/messages")
    throw new Error(
      "The viewer is read-only. Mira demonstrates fictional actions inside the guided simulation.",
    );
  if (p === "/auth/me")
    return state.users.find((u) => token === `presentation:${u.id}`);
  if ((p === "/cases" || p === "/referrals") && method === "POST") {
    if (token !== "presentation:coordinator") throw new Error("Coordinator persona required for intake.");
    const profiles = ["Amelia Hart", "Theo Bennett", "Nora Ellis", "Isaac Reed", "Maya Brooks", "Oliver Wells", "Lena Park", "Ethan Cole"];
    if (!Number.isInteger(body.synthetic_fixture_id) || body.synthetic_fixture_id < 1 || body.synthetic_fixture_id > 100 || !/^SYN-[A-Za-z0-9_-]{1,96}$/.test(body.external_reference || "")) throw new Error("Choose a fictional patient and a SYN- referral reference.");
    const existing = state.cases.find(c => c.external_reference === body.external_reference);
    if (existing) {
      if (existing.patient_id !== `fixture-${body.synthetic_fixture_id}` || existing.scenario !== body.scenario || existing.procedure_code !== body.procedure_code || existing.location !== body.location) throw new Error("Referral reference was already used with different content.");
      return existing;
    }
    const missing = body.scenario === "missing_note";
    const c = { id: id(), patient_id: `fixture-${body.synthetic_fixture_id}`, patient_name: profiles[(body.synthetic_fixture_id - 1) % profiles.length], case_number: `CF-DEMO-${String(state.cases.length + 1041)}`, external_reference: body.external_reference, priority: "NORMAL", scenario: body.scenario, service_line: "OUTPATIENT_MRI", procedure_code: body.procedure_code, location: body.location, overall_status: missing ? "NEEDS_ATTENTION" : "AUTHORIZATION_PENDING", referral_status: "VALIDATED", document_status: missing ? "MISSING" : "COMPLETE", insurance_status: "VERIFIED", authorization_status: body.scenario === "not_required" ? "NOT_REQUIRED" : "PENDING", scheduling_status: "NOT_SCHEDULED", clinical_status: "PENDING", financial_status: "NOT_STARTED", version: 1, created_at: new Date().toISOString() };
    state.cases.unshift(c);
    for (const type of missing ? ["order"] : ["order", "physician_note"]) state.documents.push({ id: id(), case_id: c.id, type, title: type === "order" ? "MRI referral order" : "Physician supporting note", verification_status: "VERIFIED", version: 1, indexed: true, text: `Fictional ${type.replaceAll("_", " ")} for ${c.patient_name}. Procedure ${c.procedure_code}. Location ${c.location}. Sample only; not a clinical instruction.` });
    state.events.push({ id: id(), case_id: c.id, event_type: "ReferralReceived", source: "Coordinator reviewed synthetic intake", created_at: c.created_at });
    if (missing) state.tasks.push({ id: id(), case_id: c.id, task_type: "document_review", status: "OPEN", priority: "NORMAL" });
    save();
    return c;
  }
  if (p === "/cases") return { items: state.cases, total: state.cases.length };
  if (p === "/dashboard/summary")
    return {
      case_count: state.cases.length,
      pending_approvals: state.approvals.filter(
        (a) => a.status === "AWAITING_APPROVAL",
      ).length,
      open_tasks: state.tasks.filter((t) => t.status === "OPEN").length,
      overall_statuses: Object.fromEntries(
        statuses.map((s) => [
          s,
          state.cases.filter((c) => c.overall_status === s).length,
        ]),
      ),
    };
  if (p === "/tasks") return state.tasks;
  if (p === "/approvals")
    return state.approvals.filter(
      (a) =>
        a.status === "AWAITING_APPROVAL" &&
        (!url.searchParams.get("case_id") ||
          a.case_id === url.searchParams.get("case_id")),
    );
  if (p === "/appointments") return state.appointments;
  const caseMatch = p.match(/^\/cases\/([^/]+)(?:\/(.+))?$/);
  if (caseMatch) {
    const c = state.cases.find((c) => c.id === caseMatch[1]);
    if (!c) throw new Error("Case unavailable.");
    const action = caseMatch[2];
    if (!action) return c;
    if (action === "documents" && method === "GET")
      return state.documents.filter((d) => d.case_id === c.id);
    if (action === "documents" && method === "POST") {
      if (token !== "presentation:coordinator")
        throw new Error("Coordinator persona required.");
      const d = {
        id: id(),
        case_id: c.id,
        type: body.fixture_type,
        title: "Synthetic final report",
        verification_status: "UNVERIFIED",
        version: 1,
        indexed: true,
        text: "Synthetic final MRI report. Demonstration fixture only; not a real clinical interpretation.",
      };
      state.documents.push(d);
      save();
      return d;
    }
    if (action === "appointments/propose") {
      if (token !== "presentation:coordinator")
        throw new Error("Coordinator persona required.");
      if (
        c.document_status !== "COMPLETE" ||
        !["APPROVED", "NOT_REQUIRED"].includes(c.authorization_status)
      )
        throw new Error(
          "Complete documents and authorization before scheduling.",
        );
      if (["CONFIRMED", "SCHEDULED", "COMPLETED"].includes(c.scheduling_status))
        throw new Error("This case already has an appointment.");
      const pending = state.approvals.find(a => a.case_id === c.id && a.action_type === "appointment_booking" && a.status === "AWAITING_APPROVAL");
      if (pending) return pending;
      const a = {
        id: id(),
        case_id: c.id,
        action_type: "appointment_booking",
        status: "AWAITING_APPROVAL",
        risk_level: "LOW",
        proposed_payload: body,
        required_approver_role: ["demo_admin"],
      };
      state.approvals.push(a);
      save();
      return a;
    }
    if (action === "clinical-milestones") {
      if (token !== "presentation:clinician")
        throw new Error(
          "Only the clinician persona can record this milestone.",
        );
      if (body.expected_version !== c.version)
        throw new Error(
          "This case changed. Refresh before recording the milestone.",
        );
      const next = {
        PENDING: "PREVISIT_REVIEW",
        NOT_STARTED: "PREVISIT_REVIEW",
        PREVISIT_REVIEW: "READY",
        READY: "SERVICE_COMPLETED",
        SERVICE_COMPLETED: "REPORT_FINAL",
        REPORT_FINAL: "COMMUNICATION_COMPLETE",
      }[c.clinical_status];
      if (body.milestone !== next)
        throw new Error("Record clinical milestones in sequence.");
      if (
        body.milestone === "SERVICE_COMPLETED" &&
        !["CONFIRMED", "SCHEDULED"].includes(c.scheduling_status)
      )
        throw new Error("A confirmed appointment is required.");
      if (
        body.milestone === "REPORT_FINAL" &&
        !state.documents.some(
          (d) =>
            d.case_id === c.id &&
            d.type === "final_report" &&
            d.verification_status === "VERIFIED",
        )
      )
        throw new Error("A verified final report is required.");
      c.clinical_status = body.milestone;
      if (body.milestone === "SERVICE_COMPLETED")
        c.scheduling_status = "COMPLETED";
      if (body.milestone === "SERVICE_COMPLETED") state.appointments.filter(a => a.case_id === c.id).forEach(a => a.status = "COMPLETED");
      c.version++;
      state.events.push({
        id: id(),
        case_id: c.id,
        event_type: body.milestone,
        source: "Qualified demo clinician",
        created_at: new Date().toISOString(),
      });
      save();
      return c;
    }
    if (action === "closure/propose") {
      if (token !== "presentation:coordinator")
        throw new Error("Coordinator persona required.");
      if (c.clinical_status !== "COMMUNICATION_COMPLETE")
        throw new Error("Complete the clinical communication milestone first.");
      if (c.overall_status === "FULLY_RESOLVED") throw new Error("This journey is already resolved.");
      const pending = state.approvals.find(a => a.case_id === c.id && a.action_type === "case_closure" && a.status === "AWAITING_APPROVAL");
      if (pending) return pending;
      if (
        body.disposition === "FULLY_RESOLVED" &&
        c.financial_status !== "PAID"
      )
        throw new Error("Resolve financial follow-up first.");
      const a = {
        id: id(),
        case_id: c.id,
        action_type: "case_closure",
        status: "AWAITING_APPROVAL",
        risk_level: "LOW",
        proposed_payload: body,
        required_approver_role: ["demo_admin"],
      };
      state.approvals.push(a);
      save();
      return a;
    }
    if (action === "timeline")
      return state.events.filter((e) => e.case_id === c.id);
    if (action === "readiness")
      return {
        administratively_ready:
          ["APPROVED", "NOT_REQUIRED"].includes(c.authorization_status) &&
          c.document_status === "COMPLETE",
        blockers:
          c.document_status !== "COMPLETE"
            ? ["Physician supporting note is missing"]
            : c.authorization_status === "PENDING"
              ? ["Payer authorization is pending"]
              : [],
        missing_documents:
          c.document_status !== "COMPLETE" ? ["physician_note"] : [],
        clinical_clearance: c.clinical_status,
      };
  }
  const verify = p.match(/^\/documents\/([^/]+)\/verify$/);
  if (verify) {
    if (token !== "presentation:coordinator")
      throw new Error("Coordinator persona required.");
    const d = state.documents.find((d) => d.id === verify[1]);
    if (!d) throw new Error("Document unavailable.");
    d.verification_status = "VERIFIED";
    save();
    return d;
  }
  const decision = p.match(/^\/approvals\/([^/]+)\/(approve|reject|escalate)$/);
  if (decision) {
    const a = state.approvals.find((a) => a.id === decision[1]);
    if (!a || a.status !== "AWAITING_APPROVAL")
      throw new Error("This action has already been reviewed.");
    if (token !== "presentation:coordinator")
      throw new Error(
        "Switch to the coordinator persona to review this action.",
      );
    const c = state.cases.find((c) => c.id === a.case_id);
    if (decision[2] === "approve" && a.action_type === "appointment_booking") {
      if (["CONFIRMED", "SCHEDULED", "COMPLETED"].includes(c.scheduling_status)) throw new Error("This case already has an appointment. Reject the duplicate proposal.");
      if (
        c.document_status !== "COMPLETE" ||
        !["APPROVED", "NOT_REQUIRED"].includes(c.authorization_status)
      )
        throw new Error(
          "Readiness changed. Prepare a new appointment proposal.",
        );
      c.scheduling_status = "CONFIRMED";
      c.overall_status = "SCHEDULED";
      state.appointments.push({
        id: id(),
        case_id: c.id,
        scheduled_at: a.proposed_payload.scheduled_at,
        location: a.proposed_payload.location,
        status: "CONFIRMED",
      });
      c.version++;
    }
    if (decision[2] === "approve" && a.action_type === "case_closure") {
      if (
        c.clinical_status !== "COMMUNICATION_COMPLETE" ||
        (a.proposed_payload.disposition === "FULLY_RESOLVED" &&
          c.financial_status !== "PAID")
      )
        throw new Error("Required resolution milestones are incomplete.");
      c.overall_status = a.proposed_payload.disposition;
      c.version++;
    }
    a.status =
      decision[2] === "approve"
        ? "COMPLETED"
        : decision[2] === "reject"
          ? "REJECTED"
          : "ESCALATED";
    state.events.push({
      id: id(),
      case_id: a.case_id,
      event_type:
        decision[2] === "approve"
          ? "HumanApprovalRecorded"
          : "ProposalRejected",
      source: "Alex Morgan",
      created_at: new Date().toISOString(),
    });
    save();
    return a;
  }
  if (p === "/demo/events") {
    const c = state.cases.find((c) => c.id === body.case_id);
    if (token !== "presentation:coordinator")
      throw new Error("Coordinator persona required.");
    if (body.event_type === "document_received") {
      if (c.document_status === "COMPLETE")
        throw new Error("This note is already present.");
      state.documents.push({
        id: id(),
        case_id: c.id,
        type: "physician_note",
        title: "Physician supporting note",
        verification_status: "VERIFIED",
        version: 1,
        indexed: true,
        text: "Synthetic physician note received from the referring practice.",
      });
      c.document_status = "COMPLETE";
      c.overall_status = "AUTHORIZATION_PENDING";
      state.tasks.filter(t => t.case_id === c.id && t.task_type === "document_review").forEach(t => t.status = "COMPLETED");
    } else if (body.event_type === "authorization_approved") {
      if (["APPROVED", "NOT_REQUIRED"].includes(c.authorization_status)) throw new Error("Authorization is already cleared.");
      if (c.document_status !== "COMPLETE")
        throw new Error("Receive the supporting note first.");
      c.authorization_status = "APPROVED";
      c.overall_status = "READY_TO_SCHEDULE";
    } else if (body.event_type === "claim_submitted") {
      if (c.financial_status !== "NOT_STARTED") throw new Error("A claim has already been submitted.");
      if (c.clinical_status !== "COMMUNICATION_COMPLETE")
        throw new Error("Complete the clinical journey first.");
      c.financial_status = "SUBMITTED";
    } else if (body.event_type === "claim_paid") {
      if (c.financial_status !== "SUBMITTED")
        throw new Error("Submit a claim before recording payment.");
      c.financial_status = "PAID";
    } else throw new Error("This event is unavailable.");
    c.version++;
    state.events.push({
      id: id(),
      case_id: c.id,
      event_type:
        body.event_type === "document_received"
          ? "DocumentReceived"
          : body.event_type === "authorization_approved"
            ? "AuthorizationApproved"
            : body.event_type,
      source: "Simulated integration",
      created_at: new Date().toISOString(),
    });
    save();
    return { status: "applied" };
  }
  if (p === "/assistant/messages") {
    const c = state.cases.find((c) => c.id === body.case_id);
    if (!c) throw new Error("Open a case before asking a case question.");
    const q = body.message.toLowerCase();
    const blockers =
      c.document_status !== "COMPLETE"
        ? "The physician supporting note is missing. Request the note before progressing the authorization."
        : c.authorization_status === "PENDING"
          ? "The supporting documents are complete. Payer authorization is still pending. Follow up with the synthetic payer."
          : `This case is ${c.overall_status.replaceAll("_", " ").toLowerCase()}. Documents are complete and authorization is ${c.authorization_status.toLowerCase().replaceAll("_", " ")}.`;
    const docs = state.documents.filter((d) => d.case_id === c.id);
    return {
      answer: /clinical|clearance/.test(q)
        ? `Clinical status is ${c.clinical_status.toLowerCase().replaceAll("_", " ")}. Clinical readiness must be recorded by a clinician. Administrative clearance does not establish clinical clearance.`
        : /block|missing|document|status|next|order|report|authorization/.test(
              q,
            )
          ? blockers
          : "I can explain this sample case's status, missing documents, authorization and clinical milestones using its records. This question goes beyond those demo answers. Ask your care team or use Mira's product questions for feature and deployment information.",
      sources: [
        { title: c.case_number, record_type: "case", record_id: c.id },
        ...docs.slice(0, 1).map((d) => ({
          title: d.title,
          record_type: "document",
          record_id: d.id,
          document_id: d.id,
          page: 1,
          version: d.version,
          excerpt: d.text,
        })),
      ],
      provider: "presentation",
      conversation_id: id(),
    };
  }
  const task = p.match(/^\/tasks\/(.+)$/);
  if (task && method === "PATCH") {
    const t = state.tasks.find((t) => t.id === task[1]);
    if (!t) throw new Error("Task unavailable.");
    t.status = body.status;
    save();
    return t;
  }
  throw new Error("This action is unavailable in the browser presentation.");
}
export async function login(user) {
  const r = await request("/auth/demo-login", { user_id: user.id });
  token = r.access_token;
  sessionStorage.setItem("careflow-session", token);
  sessionStorage.setItem("careflow-persona", JSON.stringify(user));
  return user;
}
export function resetPresentation() {
  state = viewerMode ? buildGuideState() : fresh();
  save();
}
export async function snapshot() {
  const [first, summary, tasks, approvals] = await Promise.all([
    request("/cases?limit=100"),
    request("/dashboard/summary"),
    request("/tasks"),
    request("/approvals"),
  ]);
  const cases = [...first.items];
  if (connected && first.total > 100) {
    const second = await request("/cases?offset=100&limit=100");
    cases.push(...second.items);
  }
  if (connected) {
    const patients = await request("/patients");
    const directory = new Map(patients.map((p) => [p.id, p]));
    cases.forEach((c) => {
      const patient = directory.get(c.patient_id);
      if (patient) c.patient_name = patient.name.replace(/^Synthetic /, "");
    });
  }
  return { cases, summary, tasks, approvals };
}
