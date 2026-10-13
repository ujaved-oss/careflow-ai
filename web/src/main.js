import "./styles.css";
import "./icons.css";
import "./fonts.css";
import "./home-story.css";
import "./guide.css";
import "./intake.css";
import "./mira.css";
import "./walkthrough.css";
import "./team.css";
import "./ai.css";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  connected,
  request,
  login,
  logout,
  token,
  snapshot,
  resetPresentation,
  viewerMode,
  enterViewer,
} from "./gateway.js";
import { problemStory } from "./home-story.js";
import {aiHome,bindAIHome} from "./ai-home.js";
import { caseActions, handoffHint } from "./case-workflow.js";
gsap.registerPlugin(ScrollTrigger);
const app = document.querySelector("#app");
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icon = (name, cls = "") =>
  `<i class="ph ph-${name} ${cls}" aria-hidden="true"></i>`;
const logo = () =>
  `<a class="brand" href="#/" aria-label="CareFlow AI home"><img src="/logo.svg" width="34" height="34" alt=""><span>careflow <span class="brand-ai">ai</span></span></a>`;
const pretty = (s) =>
  ({ PREVISIT_REVIEW: "Before-visit check", READY: "Ready for the visit", SERVICE_COMPLETED: "Visit finished", REPORT_FINAL: "Report finished", COMMUNICATION_COMPLETE: "Report shared", FULLY_RESOLVED: "Case closed", CLINICALLY_RESOLVED: "Care finished", FINANCIAL_FOLLOW_UP: "Bill needs follow-up", AWAITING_APPROVAL: "Needs a person’s review", AUTHORIZATION_PENDING: "Waiting for insurance", PAYER_PENDING: "Waiting for insurance", MISSING_DOCUMENTS: "Papers missing", NEEDS_ATTENTION: "Needs help", READY_TO_SCHEDULE: "Ready to book", NOT_SCHEDULED: "Not booked", SCHEDULED: "Visit booked", CONFIRMED: "Confirmed", VALIDATED: "Checked", VERIFIED: "Checked", NOT_STARTED: "Not started", appointment_booking: "Book the visit", case_closure: "Close the case", request_missing_document: "Ask for the missing note", authorization_submission: "Send the insurance request", payer_follow_up: "Ask insurance for an update", document_review: "Check the papers", administrative_follow_up: "Follow up with the team" })[s] || String(s ?? "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
const patient = (c) =>
  c.patient_name || `Patient ${c.case_number.split("-").at(-1)}`;
const initials = (s) =>
  s
    .split(" ")
    .slice(0, 2)
    .map((x) => x[0])
    .join("");
const completeStates = new Set([
  "ACCEPTED",
  "VALIDATED",
  "COMPLETE",
  "COMPLETED",
  "VERIFIED",
  "APPROVED",
  "NOT_REQUIRED",
  "CONFIRMED",
  "SCHEDULED",
  "READY",
  "SERVICE_COMPLETED",
  "REPORT_FINAL",
  "COMMUNICATION_COMPLETE",
  "PAID",
  "ADJUSTED",
  "OTHER_RESOLUTION",
  "FULLY_RESOLVED",
  "CLINICALLY_RESOLVED",
  "READY_TO_SCHEDULE",
]);
const done = (s) => completeStates.has(s);
const badge = (s) =>
  `<span class="badge ${done(s) ? "good" : /MISSING|ATTENTION|DENIED|HIGH|HOLD|STALE|EXPIRED|MISMATCH/.test(s) ? "warn" : "neutral"}">${esc(pretty(s))}</span>`;
const readyToSchedule = (c) =>
  ["APPROVED", "NOT_REQUIRED"].includes(c.authorization_status) &&
  c.document_status === "COMPLETE" &&
  !["CONFIRMED", "SCHEDULED", "COMPLETED"].includes(c.scheduling_status) &&
  c.clinical_status !== "COMMUNICATION_COMPLETE";
const localDateValue = (d) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
const blockerLabel = (s) =>
  ({
    missing_physician_note: "The supporting physician note is missing",
    missing_order: "The MRI order is missing",
    authorization_not_applicable:
      "Payer authorization has not cleared this order",
    invalid_service_order: "The service order needs review",
    referral_not_accepted: "The referral needs intake review",
    insurance_unresolved: "Coverage needs review",
    authorization_expired: "The authorization has expired",
    authorization_missing_decision: "The payer decision is incomplete",
  })[s] || pretty(s);
const formatAnswer = (s) =>
  s
    .replace(/[\u2013\u2014]/g, "-")
    .replace(
      /\b(missing_physician_note|missing_order|authorization_not_applicable|invalid_service_order|referral_not_accepted|insurance_unresolved|authorization_expired|authorization_missing_decision)\b/g,
      blockerLabel,
    )
    .replace(/\bphysician_note\b/g, "physician note")
    .replace(/\b[A-Z][A-Z_]{2,}\b/g, (v) =>
      completeStates.has(v) ||
      [
        "REQUIRED",
        "PENDING",
        "NOT_STARTED",
        "MISSING",
        "UNSCHEDULED",
        "ACTIVE",
      ].includes(v)
        ? pretty(v)
        : v,
    );
const button = (label, attr = "", style = "primary", ico = "arrow-up-right") =>
  `<button class="button ${style}" ${attr}>${esc(label)}${ico ? icon(ico) : ""}</button>`;
let animations,
  observer,
  poll,
  store,
  user,
  page = "overview",
  filter = "all",
  search = "",
  activeCase,
  caseData,
  caseTab = "journey",
  tour = false,
  loading = false,
  conversationId;
let routeEpoch = 0,
  caseEpoch = 0;
let guideController, guideLoading;
let teamController;
function stopGuide() {
  guideController?.stop();
}
async function guideTools() {
  guideLoading ??= import("./guide-ui.js").then(
    (m) =>
      (guideController = m.createGuide({
        app,
        esc,
        icon,
        button,
        pretty,
        badge,
        displayStatus,
        readyToSchedule,
        nextStep,
        flowMarkup,
        proposalDetails,
        caseRows,
        empty,
        bindCases,
        ask,
        toast,
        openDocument,
        beginViewer,
        updateStore(value) {
          store = value;
        },
        onCase(state) {
          activeCase = state.cases[0];
          caseData = {
            docs: state.documents,
            timeline: state.events,
            approvals: state.approvals.filter(
              (a) => a.status === "AWAITING_APPROVAL",
            ),
            readiness: {
              blockers: [],
              administratively_ready: activeCase && readyToSchedule(activeCase),
            },
          };
        },
      })),
  );
  return guideLoading;
}
function toast(msg) {
  const t = document.querySelector("#toast");
  t.textContent = msg;
  t.classList.add("visible");
  clearTimeout(t.timer);
  t.timer = setTimeout(() => t.classList.remove("visible"), 4400);
}
function cleanup() {
  teamController?.stop();
  stopGuide();
  animations?.revert();
  observer?.disconnect();
  clearInterval(poll);
  document.querySelector("dialog")?.close();
}
function navigate(path) {
  location.hash = path;
}
function landing() {
  document.title = "CareFlow AI | A clear path through care";
  app.innerHTML = `<div class="landing"><header class="site-nav">${logo()}<nav aria-label="Main navigation"><a href="#product" data-anchor="product">The product</a><a href="#people" data-anchor="people">Human by design</a></nav><a class="button small primary" href="#/login">See demo ${icon("arrow-up-right")}</a></header>
  <main id="main"><section class="hero"><div class="hero-copy"><span class="eyebrow">A shared workspace for hospital staff</span><h1>Hospital paperwork.<br>One shared place.</h1><p>For admins, coordinators and doctors. Track requests, appointments, reports and bills. Try one fictional case with Mira and simulated AI helpers.</p></div><div class="hero-art"><div class="hero-context context-problem"><span>The problem</span><strong>Too many handoffs.<br>Too little clarity.</strong><p>Missing notes.<br>Waiting on insurance.<br>No clear owner.</p></div><div class="hero-context context-answer"><span>The answer</span><strong>One case.<br>A clear next task.</strong><p>The request stays saved.<br>Everyone sees their task.<br>Each change is recorded.</p></div><img class="glass-sculpture" src="/assets/careflow-glass.webp" alt="A floating sculptural glass loop with a blue care pathway" width="1536" height="1024" fetchpriority="high"><div class="art-orbit orbit-one"><span class="orb-icon">${icon("file-text")}</span><span>Evidence connected<small>A shared case, a clearer view</small></span>${icon("check", "orbit-check")}</div><div class="art-orbit orbit-two"><span class="orb-icon">${icon("sparkle")}</span><span>Next step, ready<small>Your approval comes first</small></span></div><button class="art-orbit orbit-three" data-action="hero-live"><span class="live-dot"></span><span>See how a case moves</span>${icon("arrow-down-right")}</button></div><div class="hero-bottom"><span>Less chasing.<br><strong>More caring.</strong></span><a href="#product" data-anchor="product" class="text-link">Discover CareFlow ${icon("arrow-down")}</a><span class="hero-note">A guided, fictional MRI journey</span></div></section>
  ${problemStory(icon)}<section class="workspace-preview"><div class="workspace-preview-copy reveal"><h2>A request. An owner.<br>A next step.</h2><p>An MRI request arrives. Intake checks the missing note. The doctor reviews it, insurance records its answer, and scheduling books the visit.</p><p>Everyone works on the same case. They see their task and the details their role needs.</p></div><figure class="reveal"><img src="/assets/careflow-workspace.png" alt="CareFlow staff workspace showing a returned MRI request, its assigned intake person and the correction task" width="1280" height="720" loading="lazy"><figcaption>Actual demo screen with fictional data. You will use these same staff screens.</figcaption></figure></section><section id="product" class="story-section"><div class="story-stick"><div class="story-copy"><h2>One referral.<br>A team in sync.</h2><p>Every handoff belongs to the same care journey.</p><div class="story-caption"><span id="story-step-title">A referral finds its home.</span><p id="story-step-body">Intake brings the order, patient record, and care team into one place.</p></div><div class="story-navigation" aria-label="Explore care stages">${["Intake", "Documents", "Authorization", "Schedule", "Resolution"].map((x, i) => `<button data-story="${i}" class="${i === 0 ? "active" : ""}" aria-label="Show ${x} stage">${x}</button>`).join("")}</div></div><div class="journey-art"><div class="journey-halo"></div><div class="journey-center"><img src="/logo.svg" width="60" height="60" alt="CareFlow"><span>Connected care</span><small id="story-center-label">A new journey begins</small></div><div class="orbit-ring"></div>${[
    ["file-plus", "Referral"],
    ["files", "Documents"],
    ["shield-check", "Authorization"],
    ["calendar-check", "Schedule"],
    ["check-circle", "Resolution"],
  ]
    .map(
      ([ico, label], i) =>
        `<div class="journey-node node-${i} ${i === 0 ? "active" : ""}" data-node="${i}"><div>${icon(ico)}</div><span>${label}</span></div>`,
    )
    .join(
      "",
    )}<div class="journey-proof"><span class="live-dot"></span><span id="story-proof">Referral linked to its case</span>${icon("check")}</div></div></div></section>
  <section class="clarity-section"><div class="clarity-heading reveal"><h2>The request stays<br>with the team.</h2><p>The request, owner and saved decisions stay with one shared case.</p></div><div class="clarity-layout"><div class="document-visual reveal"><div class="document-sheet"><div class="document-mark">${icon("file-text")} <span>Synthetic MRI referral</span></div><h3>A request you can follow.</h3><div class="document-lines"><span></span><span></span><span></span></div><div class="document-fact"><span>Supporting note</span><strong>Recorded ${icon("check-circle")}</strong></div><div class="document-fact"><span>Insurer answer</span><strong>Recorded ${icon("check-circle")}</strong></div><div class="document-source">${icon("link")} Saved request. Reference. Owner.</div></div><div class="glass-caption">${icon("sparkle")} Sample records you can inspect.</div></div><div class="clarity-points reveal"><article><span class="feature-icon">${icon("files")}</span><h3>The request, in context.</h3><p>Open the saved fictional request and see who registered it. Staff enter sample notes; the demo reader prepares fields from labeled fictional text.</p></article><article><span class="feature-icon">${icon("chat-circle-text")}</span><h3>Ask what happens next.</h3><p>Mira retrieves saved case facts and permitted papers in a simulated assistant. Sources show where each answer came from.</p></article><article><span class="feature-icon">${icon("arrows-split")}</span><h3>Know the next handoff.</h3><p>See the request check, visit, report and bill as separate steps in the same case.</p></article></div></div></section>
  ${aiHome()}<section id="people" class="people-section"><div class="people-inner"><span class="eyebrow reveal">Human by design</span><h2 class="reveal">People review.<br><span>Work moves.</span></h2><p class="reveal">The responsible person checks the details and passes the task to the next person. The demo helpers prepare fields, check papers and draft replies. People review every decision. Live AI and hospital connections are future work.</p><div class="approval-art reveal"><div class="approval-art-top"><span class="feature-icon">${icon("hand-palm")}</span><span>Awaiting your review<small>Check the sample request before handoff</small></span><span class="badge neutral">Human approval</span></div><div class="approval-rail"><span>${icon("file-text")} Sample details</span>${icon("arrow-right")}<span>${icon("user-check")} Your decision</span>${icon("arrow-right")}<span>${icon("check-circle")} Recorded action</span></div></div><div class="human-details reveal"><span>${icon("lock-key")} Role-based demo access</span><span>${icon("clock-counter-clockwise")} A traceable timeline</span><span>${icon("stethoscope")} Clinical decisions stay clinical</span></div></div></section>
  <section class="final-section"><div class="final-sculpture" aria-hidden="true"><img src="/assets/careflow-glass.webp" width="1536" height="1024" alt="" loading="lazy"></div><div class="final-copy reveal"><h2>Meet your next<br>care workspace.</h2><p>Mira guides the actual staff screens, through six profiles and one shared case. Finish with a results sheet from that same case.</p><a class="button primary large" href="#/login">Meet Mira in the demo ${icon("arrow-up-right")}</a><small>Fictional patients. Shared records. Simulated AI. No live insurer, email or payments.</small></div></section></main><footer class="site-footer">${logo()}<span>CareFlow AI. Care, with a clearer path.</span><a href="#/login">See demo ${icon("arrow-up-right")}</a></footer></div>`;
  bindAIHome(app);
  const titles = [
    "A referral finds its home.",
    "The missing piece becomes clear.",
    "Authorization stays in view.",
    "The next appointment, aligned.",
    "Close the loop with confidence.",
  ];
  const bodies = [
    "Intake brings the order, patient record, and care team into one place.",
    "Intake checks the sample note. Open the saved request and see where it came from.",
    "Noor checks the insurer outside CareFlow, then records its answer and evidence.",
    "After doctor review and insurance approval, Taylor confirms one appointment.",
    "Clinical completion and financial follow-up remain visible until resolution.",
  ];
  const proofs = [
    "Referral linked to its case",
    "Supporting documents reviewed",
    "Payer decision recorded",
    "Ready for the scheduling team",
    "Every handoff is traceable",
  ];
  function stage(i) {
    document.querySelectorAll("[data-node]").forEach((el, j) => {
      el.classList.toggle("active", j === i);
      el.classList.toggle("completed", j < i);
    });
    document
      .querySelectorAll("[data-story]")
      .forEach((el, j) => el.classList.toggle("active", j === i));
    document.querySelector("#story-step-title").textContent = titles[i];
    document.querySelector("#story-step-body").textContent = bodies[i];
    document.querySelector("#story-proof").textContent = proofs[i];
    document.querySelector("#story-center-label").textContent = [
      "A new journey begins",
      "A clearer picture",
      "A reviewed decision",
      "A coordinated handoff",
      "A resolved journey",
    ][i];
  }
  app
    .querySelectorAll("[data-story]")
    .forEach((b) => (b.onclick = () => stage(Number(b.dataset.story))));
  app.querySelectorAll("[data-anchor]").forEach(
    (a) =>
      (a.onclick = (e) => {
        e.preventDefault();
        document.getElementById(a.dataset.anchor).scrollIntoView({
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        });
      }),
  );
  app.querySelector('[data-action="hero-live"]').onclick = () =>
    document.querySelector("#product").scrollIntoView({ behavior: "smooth" });
  animations = gsap.matchMedia();
  animations.add("(prefers-reduced-motion: no-preference)", () => {
    gsap.from(".hero-copy>*", {
      y: 18,
      opacity: 0,
      duration: 0.6,
      stagger: 0.08,
      ease: "power3.out",
    });
    gsap.from(".hero-art", {
      y: 16,
      duration: 0.6,
      delay: 0,
      ease: "power3.out",
    });
    gsap.to(".glass-sculpture", {
      y: -15,
      rotation: 1.2,
      duration: 4,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });
    gsap.from(".art-orbit", {
      y: 20,
      opacity: 0,
      duration: 0.9,
      stagger: 0.15,
      delay: 0.8,
    });
    gsap.from(".hero-context", {
      y: 25,
      opacity: 0,
      duration: 0.9,
      stagger: 0.18,
      delay: 0.35,
    });
    gsap.to(".hero-art", {
      y: -32,
      scrollTrigger: {
        trigger: ".hero",
        start: "top top",
        end: "bottom top",
        scrub: 1.2,
      },
    });
    const cards = gsap.utils.toArray(".problem-card");
    cards.forEach((card, i) =>
      gsap.from(card, {
        y: 60,
        scale: 0.95,
        opacity: 0,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: {
          trigger: card,
          start: "top 86%",
          end: "top 45%",
          scrub: 1,
        },
      }),
    );
    gsap.fromTo(
      ".problem-connection span",
      { scaleY: 0 },
      {
        scaleY: 1,
        transformOrigin: "top",
        ease: "none",
        scrollTrigger: {
          trigger: ".problem-stack",
          start: "top 65%",
          end: "bottom 65%",
          scrub: 1,
        },
      },
    );
    const revealTweens = [];
    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            revealTweens.push(
              gsap.from(entry.target, {
                y: 30,
                opacity: 0,
                duration: 0.8,
                ease: "power3.out",
              }),
            );
            revealObserver.unobserve(entry.target);
          }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    document
      .querySelectorAll(".reveal")
      .forEach((el) => revealObserver.observe(el));
    return () => {
      revealObserver.disconnect();
      revealTweens.forEach((t) => t.revert());
    };
  });
  animations.add(
    "(min-width: 900px) and (prefers-reduced-motion: no-preference)",
    () => {
      let previous = 0;
      ScrollTrigger.create({
        trigger: ".story-section",
        start: "top top",
        end: "+=2200",
        pin: ".story-stick",
        scrub: 1,
        onUpdate: (self) => {
          const next = Math.min(4, Math.floor(self.progress * 5));
          if (previous !== next) {
            previous = next;
            stage(next);
            gsap.fromTo(
              ".story-caption",
              { y: 16, opacity: 0 },
              { y: 0, opacity: 1, duration: 0.45, overwrite: true },
            );
          }
        },
      });
    },
  );
  const artObserver = new IntersectionObserver((entries) => {
    const float = gsap
      .getTweensOf(".glass-sculpture")
      .find((t) => t.repeat() === -1);
    float?.paused(!entries[0].isIntersecting);
  });
  artObserver.observe(document.querySelector(".hero-art"));
  observer = artObserver;
}
async function loginPage(epoch) {
  document.title = 'Sign in | CareFlow AI';
  const {teamLoginScreen}=await import('./team-ui.js');
  if(epoch!==routeEpoch)return;
  await teamLoginScreen({app,esc,icon,button,logo,navigate,onStaffLogin:logout,isCurrent:()=>epoch===routeEpoch,beginViewer:()=>{logout();beginViewer();}});
  return;
  document.title = "Sign in | CareFlow AI";
  app.innerHTML = `<div class="login-page"><header>${logo()}<a class="text-link" href="#/">${icon("arrow-left")} Back to website</a></header><main id="main" class="login-layout"><section class="login-art"><img src="/assets/careflow-glass.webp" alt="CareFlow glass sculpture" width="1536" height="1024"><div><h1>Good care starts<br>with a clear view.</h1><p>Your next care journey is waiting.</p></div></section><section class="login-panel"><span class="feature-icon large-icon">${icon("sign-in")}</span><h2>Welcome to CareFlow.</h2><p>Choose a fictional team member to explore.</p><form id="login-form"><label for="persona">Demo persona</label><div class="select-wrap"><select id="persona" required disabled><option>Loading team members...</option></select>${icon("caret-down")}</div><div id="persona-detail" class="persona-detail skeleton"></div><p id="login-error" class="error-message" role="alert"></p>${button("Enter workspace", 'type="submit" id="enter-demo" disabled', "primary", "arrow-right")}</form><div class="demo-disclosure">${icon("shield-check")}<span>Synthetic demo only.<br>${connected ? "Connected to your local backend." : "Actions are simulated in this browser."}</span></div></section></main></div>`;
  const guidedEntry = document.createElement("div");
  guidedEntry.className = "guided-entry";
  guidedEntry.innerHTML = `<span class="mira-avatar">${icon("sparkle")}</span><div><strong>Try a guided case with Mira.</strong><p>Mira shows what to click and type. You take one sample case from start to finish.</p></div>${button("Start guided case", "data-start-viewer", "primary", "play-circle")}<small>Click and type at your own pace. Sample data only.</small>`;
  app.querySelector(".login-panel").prepend(guidedEntry);
  guidedEntry.querySelector("[data-start-viewer]").onclick = beginViewer;
  try {
    const users = await request("/auth/demo-users");
    if (epoch !== routeEpoch) return;
    const select = app.querySelector("#persona");
    select.innerHTML = users
      .map(
        (u) =>
          `<option value="${esc(u.id)}">${esc(u.name.replace(/^Demo Demo /, "Demo "))} | ${esc(pretty(u.role))}</option>`,
      )
      .join("");
    const defaultUser = users.find((u) => u.role === "demo_admin");
    if (defaultUser) select.value = defaultUser.id;
    select.disabled = false;
    app.querySelector("#enter-demo").disabled = false;
    const update = () => {
      const selected = users.find((u) => u.id === select.value);
      app.querySelector("#persona-detail").classList.remove("skeleton");
      app.querySelector("#persona-detail").innerHTML =
        `<span class="avatar">${initials(selected.name)}</span><span><strong>${esc(selected.name.replace(/^Demo Demo /, "Demo "))}</strong><small>${esc(pretty(selected.role))} access</small></span>`;
    };
    select.onchange = update;
    update();
    app.querySelector("#login-form").onsubmit = async (e) => {
      e.preventDefault();
      const b = app.querySelector("#enter-demo");
      b.disabled = true;
      b.textContent = "Opening workspace...";
      try {
        await login(users.find((u) => u.id === select.value));
        navigate("/app");
      } catch (err) {
        app.querySelector("#login-error").textContent = err.message;
        b.disabled = false;
        b.innerHTML = `Enter workspace ${icon("arrow-right")}`;
      }
    };
  } catch (err) {
    if (epoch !== routeEpoch) return;
    app.querySelector("#login-error").textContent = connected
      ? "The local backend is unavailable. Start CareFlow, then retry."
      : err.message;
    app.querySelector("#persona").innerHTML =
      "<option>Team unavailable</option>";
  }
}
const navigation = [
  ["overview", "squares-four", "Overview"],
  ["cases", "stack", "Work queue"],
  ["approvals", "hand-palm", "Approvals"],
  ["schedule", "calendar-blank", "Schedule"],
  ["insights", "chart-line-up", "Insights"],
];
function workspaceNavigation() {
  return viewerMode
    ? [["guide", "play-circle", "Guided demo"], ...navigation]
    : navigation;
}
function shell() {
  app.innerHTML = `<div class="workspace ${viewerMode ? "viewer-workspace" : ""}"><aside class="sidebar">${logo()}<div class="hospital-switch">${icon("buildings")}<span>${esc((user.hospital_name || "CareFlow Hospital").replace(/^Synthetic /, ""))}<small>Outpatient services</small></span></div><nav aria-label="Workspace navigation">${workspaceNavigation()
    .map(
      ([id, ico, label]) =>
        `<button data-page="${id}" class="nav-item ${page === id ? "selected" : ""}">${icon(ico)}<span>${label}</span>${id === "approvals" ? `<span class="nav-count">${store.approvals.length}</span>` : ""}</button>`,
    )
    .join(
      "",
    )}</nav><div class="sidebar-bottom"><div class="mode-label">${icon(connected ? "plugs-connected" : "flask")}<span>${connected ? "Connected demo" : "Interactive simulation"}<small>Synthetic patient records</small></span></div><button class="profile" data-action="switch-persona"><span class="avatar">${initials(user.name)}</span><span><strong>${esc(user.name.replace(/^Demo Demo /, "Demo "))}</strong><small>${esc(pretty(user.role))}</small></span>${icon("arrows-left-right")}</button><a href="#/" class="back-site">${icon("arrow-up-left")} Back to website</a></div></aside><div class="workspace-body"><header class="workspace-header"><div><span class="breadcrumb">Workspace ${icon("caret-right")} ${workspaceNavigation().find((n) => n[0] === page)?.[2] || "Workspace"}</span><span class="workspace-mobile-brand">CareFlow AI</span></div><div class="header-actions"><span class="synthetic-label">${viewerMode ? "Practice workspace" : "Synthetic demo"}</span><button class="icon-button" data-action="product-help" aria-label="Ask Mira about the product">${icon("chat-circle-text")}</button>${!connected ? `<button class="icon-button" data-action="restart" aria-label="Restart browser demo">${icon("clock-counter-clockwise")}</button>` : ""}<button class="icon-button" data-action="refresh" aria-label="Refresh workspace">${icon("arrows-clockwise")}</button><button class="icon-button" data-action="logout" aria-label="Sign out">${icon("sign-out")}</button></div></header><main id="main" class="workspace-main"></main></div></div><dialog id="case-dialog" class="case-dialog" aria-labelledby="case-title"></dialog><dialog id="document-dialog" class="document-dialog" aria-labelledby="document-title"></dialog>`;
  app
    .querySelector('[data-action="restart"]')
    ?.addEventListener("click", async () => {
      stopGuide();
      resetPresentation();
      guideController?.reset();
      sessionStorage.removeItem("careflow-guide-visited");
      if (viewerMode) page = "guide";
      store = await snapshot();
      shell();
      renderPage();
      toast("Browser demo restarted.");
    });
  const newCase = document.createElement("button");
  newCase.className = "icon-button new-case-button";
  newCase.setAttribute("aria-label", viewerMode ? "New practice case" : "New case / referral intake");
  newCase.title = viewerMode ? "Start a fresh sample case" : "New case / referral intake";
  newCase.innerHTML = `${icon("file-plus")}<span>${viewerMode ? 'New practice case' : 'New case'}</span>`;
  newCase.onclick = openNewCase;
  app.querySelector(".header-actions").prepend(newCase);
  app.querySelectorAll("[data-page]").forEach(
    (b) =>
      (b.onclick = () => {
        stopGuide();
        page = b.dataset.page;
        filter = "all";
        search = "";
        shell();
        renderPage();
      }),
  );
  app.querySelector('[data-action="logout"]').onclick = () => {
    logout();
    navigate("/login");
  };
  app.querySelector('[data-action="product-help"]').onclick = openProductHelp;
  app.querySelector('[data-action="switch-persona"]').onclick = () =>
    viewerMode ? openProductHelp() : openRolePicker();
  app.querySelector('[data-action="refresh"]').onclick = async () => {
    try {
      store = await snapshot();
      shell();
      renderPage();
      toast("Workspace updated.");
    } catch (err) {
      toast(err.message);
    }
  };
  guideTools().then(guide => guide.mount());
}
function heading(title, sub, actions = "") {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${sub}</p></div>${actions}</div>`;
}
function caseRows(cases, limit = 8) {
  return cases
    .slice(0, limit)
    .map(
      (c, i) =>
        `<button class="case-row" data-case="${esc(c.id)}"><span class="patient-cell"><span class="avatar tone-${i % 3}">${c.patient_name ? initials(c.patient_name) : c.case_number.slice(-3)}</span><span><strong>${esc(patient(c))}</strong><small>${esc(c.case_number)}</small></span></span><span class="procedure-cell"><strong>MRI brain</strong><small>Outpatient imaging</small></span><span class="status-cell">${badge(displayStatus(c))}</span><span class="next-cell">${esc(nextStep(c))}</span><span class="row-arrow">${icon("arrow-up-right")}</span></button>`,
    )
    .join("");
}
function nextStep(c) {
  if (c.overall_status === "FULLY_RESOLVED") return "Case closed";
  if (
    c.scenario === "ambiguous_identity" &&
    !["ACCEPTED", "VALIDATED"].includes(c.referral_status)
  )
    return "Check the patient details";
  if (
    c.scenario === "invalid_order" &&
    !["ACCEPTED", "VALIDATED"].includes(c.referral_status)
  )
    return "Check the doctor's request";
  if (/MISSING|NOT_REVIEWED|REVIEW/.test(c.document_status))
    return "Collect the missing papers";
  if (!["APPROVED", "NOT_REQUIRED"].includes(c.authorization_status))
    return "Check insurance approval";
  if (!["CONFIRMED", "SCHEDULED", "COMPLETED"].includes(c.scheduling_status))
    return "Book a visit";
  if (c.clinical_status !== "COMMUNICATION_COMPLETE")
    return "Care team checks";
  return "Check the bill";
}
function displayStatus(c) {
  if (c.overall_status === "FULLY_RESOLVED") return "FULLY_RESOLVED";
  if (c.financial_status === "DENIED") return "CLAIM_DENIED";
  if (c.document_status === "MISSING") return "MISSING_DOCUMENTS";
  if (c.authorization_status === "MISMATCH") return "AUTHORIZATION_MISMATCH";
  if (
    ["DENIED", "EXPIRED", "MORE_INFORMATION"].includes(c.authorization_status)
  )
    return `AUTHORIZATION_${c.authorization_status}`;
  if (c.clinical_status === "SERVICE_COMPLETED") return "REPORT_PENDING";
  if (c.clinical_status === "COMMUNICATION_COMPLETE")
    return "FINANCIAL_FOLLOW_UP";
  if (["CONFIRMED", "SCHEDULED"].includes(c.scheduling_status))
    return "SCHEDULED";
  if (readyToSchedule(c)) return "READY_TO_SCHEDULE";
  if (
    ["PENDING", "SUBMITTED", "REQUIRED", "PREPARING"].includes(
      c.authorization_status,
    )
  )
    return "PAYER_PENDING";
  return c.overall_status;
}
function renderPage() {
  if (viewerMode && page === "guide") {
    renderGuide();
    return;
  }
  const main = app.querySelector(".workspace-main");
  const s = store.summary;
  if (page === "overview") {
    const attention = store.cases.filter(
      (c) =>
        c.overall_status !== "FULLY_RESOLVED" &&
        (/MISSING|HOLD|REVIEW|NOT_REVIEWED/.test(c.document_status) ||
          /HIGH/.test(c.priority) ||
          /DENIED|PENDING|EXPIRED/.test(c.authorization_status)),
    );
    main.innerHTML =
      heading(
        "A clearer day starts here.",
        "Your outpatient care journeys, in one view.",
        button(
          viewerMode ? "Resume with Mira" : "Meet Mira",
          'data-action="tour"',
          "secondary",
          "play",
        ),
      ) +
      `<section class="overview-metrics" aria-label="Workspace metrics">${[
        ["Care journeys", s.case_count, "stack"],
        ["Awaiting approval", s.pending_approvals, "hand-palm"],
        ["Open tasks", s.open_tasks, "check-square"],
        [
          "Ready to schedule",
          store.cases.filter(readyToSchedule).length,
          "calendar-check",
        ],
      ]
        .map(
          ([label, value, ico]) =>
            `<div class="metric">${icon(ico)}<span>${label}</span><strong>${value}</strong></div>`,
        )
        .join(
          "",
        )}</section><div class="overview-grid"><section class="attention-panel surface"><div class="panel-heading"><h2>Needs a human touch</h2><button class="text-link" data-goto="cases">View queue ${icon("arrow-right")}</button></div><div class="attention-feature"><span class="attention-icon">${icon("files")}</span><div><span>Next best step</span><h3>${store.approvals.length ? "Review the actions prepared for you." : "Keep the next handoff moving."}</h3><p>${store.approvals.length} proposed actions are waiting for a decision.</p></div><button class="icon-button" data-goto="approvals" aria-label="Open approvals">${icon("arrow-up-right")}</button></div><div class="case-table"><div class="table-labels"><span>Patient / case</span><span>Procedure</span><span>Current state</span><span>Next step</span><span></span></div>${caseRows(attention.length ? attention : store.cases, 5)}</div></section><aside class="today-panel surface"><div class="panel-heading"><h2>Your care pulse</h2>${icon("activity")}</div><div class="pulse-visual"><div class="pulse-ring"><strong>${s.case_count}</strong><span>care journeys</span></div><span class="pulse-caption">Every case has a next step.</span></div><div class="pulse-legend">${[
        [
          "Documents complete",
          store.cases.filter((c) => c.document_status === "COMPLETE").length,
        ],
        [
          "Authorization cleared",
          store.cases.filter((c) =>
            ["APPROVED", "NOT_REQUIRED"].includes(c.authorization_status),
          ).length,
        ],
        [
          "Appointments confirmed",
          store.cases.filter((c) =>
            ["CONFIRMED", "SCHEDULED"].includes(c.scheduling_status),
          ).length,
        ],
      ]
        .map(([l, n]) => `<div><span>${l}</span><strong>${n}</strong></div>`)
        .join(
          "",
        )}</div><button class="text-link" data-goto="insights">Explore workflow ${icon("arrow-right")}</button></aside></div><section class="task-panel surface"><div class="panel-heading"><h2>Team handoffs</h2><span class="muted">${s.open_tasks} open tasks</span></div><div class="task-list">${
        store.tasks
          .filter((t) => !["COMPLETED", "CANCELED"].includes(t.status))
          .slice(0, 4)
          .map((t) => taskMarkup(t))
          .join("") ||
        empty(
          "Your team is up to date.",
          "New workflow tasks will appear here.",
          "check-circle",
        )
      }</div></section>`;
  } else if (page === "cases") {
    main.innerHTML =
      heading(
        "Keep care moving.",
        "Find a case, understand the blockers, take the next step.",
      ) +
      `<div class="queue-controls"><div class="filter-tabs" aria-label="Case filters">${[
        ["all", "All journeys"],
        ["attention", "Needs attention"],
        ["ready", "Ready to schedule"],
        ["scheduled", "Scheduled"],
      ]
        .map(
          ([v, l]) =>
            `<button data-filter="${v}" class="${filter === v ? "active" : ""}">${l}</button>`,
        )
        .join(
          "",
        )}</div><label class="search-field">${icon("magnifying-glass")}<span class="sr-only">Search patient or case</span><input type="search" id="case-search" value="${esc(search)}" placeholder="Find a patient or case"></label></div><section class="surface queue-panel"><div id="queue-content"></div><div id="queue-pagination" class="queue-pagination"></div></section>`;
    renderQueue();
    main.querySelector("#case-search").oninput = (e) => {
      search = e.target.value;
      renderQueue();
    };
    main.querySelectorAll("[data-filter]").forEach(
      (b) =>
        (b.onclick = () => {
          filter = b.dataset.filter;
          main
            .querySelectorAll("[data-filter]")
            .forEach((x) => x.classList.toggle("active", x === b));
          renderQueue();
        }),
    );
  } else if (page === "approvals") {
    main.innerHTML =
      heading(
        "Your judgment comes first.",
        "Review each proposal before the workflow takes action.",
      ) +
      `<div class="approval-grid">${store.approvals.map((a) => approvalMarkup(a)).join("") || `<section class="surface empty-card">${empty("All caught up.", "New proposals will appear here when an agent needs your decision.", "check-circle")}</section>`}</div>`;
  } else if (page === "schedule") {
    const scheduled = store.cases.filter((c) =>
        ["CONFIRMED", "SCHEDULED"].includes(c.scheduling_status),
      ),
      ready = store.cases.filter(readyToSchedule);
    main.innerHTML =
      heading(
        "Make the next handoff clear.",
        "Administrative readiness and clinical clearance are tracked separately.",
      ) +
      `<div class="schedule-layout"><section class="surface"><div class="panel-heading"><h2>Ready for scheduling</h2><span class="badge neutral">${ready.length} cases</span></div>${caseRows(ready, 12) || empty("No cases are ready yet.", "Complete documents and authorization to clear administrative blockers.", "calendar-blank")}</section><section class="surface schedule-book"><div class="panel-heading"><h2>Scheduled journeys</h2>${icon("calendar-check")}</div>${
        scheduled
          .slice(0, 10)
          .map(
            (c) =>
              `<button class="scheduled-case" data-case="${esc(c.id)}"><span class="calendar-square">${icon("calendar-check")}</span><span><strong>${esc(patient(c))}</strong><small>${esc(c.case_number)} / MRI brain</small></span>${badge(c.scheduling_status)}</button>`,
          )
          .join("") ||
        empty(
          "A little room to plan.",
          "Scheduled cases will appear here.",
          "calendar-blank",
        )
      }</section></div>`;
  } else {
    const stages = [
      [
        "Referral validated",
        store.cases.filter((c) =>
          ["ACCEPTED", "VALIDATED"].includes(c.referral_status),
        ).length,
      ],
      [
        "Documents complete",
        store.cases.filter((c) => c.document_status === "COMPLETE").length,
      ],
      [
        "Authorization cleared",
        store.cases.filter((c) =>
          ["APPROVED", "NOT_REQUIRED"].includes(c.authorization_status),
        ).length,
      ],
      [
        "Appointment scheduled",
        store.cases.filter((c) =>
          ["CONFIRMED", "SCHEDULED"].includes(c.scheduling_status),
        ).length,
      ],
      [
        "Clinical communication complete",
        store.cases.filter(
          (c) => c.clinical_status === "COMMUNICATION_COMPLETE",
        ).length,
      ],
      [
        "Fully resolved",
        store.cases.filter((c) => c.overall_status === "FULLY_RESOLVED").length,
      ],
    ];
    main.innerHTML =
      heading(
        "See the shape of the workflow.",
        "Current synthetic case counts. These are independent milestones, not conversion rates.",
      ) +
      `<section class="surface insights-panel"><div class="panel-heading"><h2>Care journey milestones</h2><span class="badge neutral">${s.case_count} cases</span></div><div class="workflow-chart">${stages.map(([l, n], i) => `<div class="chart-row"><span>${l}</span><div class="chart-value" style="--bar:${Math.max(1, (n / Math.max(1, s.case_count)) * 100)}%"><div class="chart-bar" style="opacity:${1 - i * 0.1}"></div></div><strong>${n}</strong></div>`).join("")}</div><p class="insight-note">${icon("info")} Clinical and financial work can progress independently. Demo activity does not establish time savings.</p></section><div class="insight-bottom"><section class="surface"><span class="feature-icon">${icon("hand-palm")}</span><h3>${s.pending_approvals} decisions waiting</h3><p>Proposed external actions stay behind human review.</p>${button("Review proposals", 'data-goto="approvals"', "secondary", "arrow-right")}</section><section class="surface"><span class="feature-icon">${icon("check-square")}</span><h3>${s.open_tasks} team handoffs</h3><p>Clear ownership keeps administrative follow-up visible.</p>${button("Open work queue", 'data-goto="cases"', "secondary", "arrow-right")}</section></div>`;
  }
  bindPage(main);
}
function empty(title, body, ico) {
  return `<div class="empty-state">${icon(ico)}<h3>${title}</h3><p>${body}</p></div>`;
}
function taskMarkup(t) {
  const c = store.cases.find((c) => c.id === t.case_id);
  return `<div class="task-row"><button class="task-check" data-task="${esc(t.id)}" aria-label="Complete ${esc(pretty(t.task_type))}">${icon("check")}</button><button class="task-label" data-case="${esc(t.case_id)}"><strong>${esc(pretty(t.task_type))}</strong><small>${esc(c ? patient(c) : "Synthetic case")} ${c ? `/ ${esc(c.case_number)}` : ""}</small></button>${badge(t.priority || "NORMAL")}</div>`;
}
let queueOffset = 0;
function renderQueue() {
  const cases = store.cases.filter(
    (c) =>
      (filter === "all" ||
        (filter === "attention" &&
          /MISSING|REVIEW|NOT_REVIEWED/.test(c.document_status)) ||
        (filter === "ready" && readyToSchedule(c)) ||
        (filter === "scheduled" &&
          ["CONFIRMED", "SCHEDULED"].includes(c.scheduling_status))) &&
      `${patient(c)} ${c.case_number} ${c.scenario}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  queueOffset = Math.min(
    queueOffset,
    Math.max(0, Math.ceil(cases.length / 10) - 1),
  );
  const target = app.querySelector("#queue-content");
  target.innerHTML = `<div class="table-labels"><span>Patient / case</span><span>Procedure</span><span>Current state</span><span>Next step</span><span></span></div>${caseRows(cases.slice(queueOffset * 10), 10) || empty("No matching journeys.", "Try another filter or search.", "magnifying-glass")}`;
  app.querySelector("#queue-pagination").innerHTML =
    `<span>${cases.length ? queueOffset * 10 + 1 : 0}-${Math.min((queueOffset + 1) * 10, cases.length)} of ${cases.length} journeys</span><div><button class="icon-button" id="previous-page" ${queueOffset === 0 ? "disabled" : ""} aria-label="Previous cases">${icon("caret-left")}</button><button class="icon-button" id="next-page" ${(queueOffset + 1) * 10 >= cases.length ? "disabled" : ""} aria-label="Next cases">${icon("caret-right")}</button></div>`;
  app.querySelector("#previous-page").onclick = () => {
    queueOffset--;
    renderQueue();
  };
  app.querySelector("#next-page").onclick = () => {
    queueOffset++;
    renderQueue();
  };
  bindCases(target);
}
function approvalMarkup(a) {
  const c = store.cases.find((c) => c.id === a.case_id);
  return `<article class="surface approval-card"><div class="approval-card-header"><span class="feature-icon">${icon("sparkle")}</span>${badge(a.risk_level || "REVIEW")}</div><h2>${esc(pretty(a.action_type))}</h2><button class="approval-case-link" data-case="${esc(a.case_id)}">${esc(c ? patient(c) : "Synthetic case")} ${icon("arrow-up-right")}</button><div class="proposal-preview"><span>Proposed action</span><p>${esc(a.proposed_payload.message || a.proposed_payload.body || a.proposed_payload.document_type || pretty(a.action_type))}</p><small>${esc(pretty(a.target_system || "Simulated integration"))}</small></div><div class="approval-footnote">${icon("hand-palm")} A human decision is required.</div><div class="approval-card-actions">${button("Review action", `data-review="${esc(a.id)}"`, "primary", "arrow-right")}</div></article>`;
}
function bindCases(root) {
  root
    .querySelectorAll("[data-case]")
    .forEach((b) => (b.onclick = () => openCase(b.dataset.case)));
}
function bindPage(root) {
  bindCases(root);
  if (viewerMode) {
    root.querySelectorAll("[data-task], [data-review]").forEach((b) => {
      b.disabled = true;
      b.title = "Practice workspace";
    });
  }
  root.querySelectorAll("[data-goto]").forEach(
    (b) =>
      (b.onclick = () => {
        page = b.dataset.goto;
        shell();
        renderPage();
      }),
  );
  root
    .querySelectorAll("[data-review]")
    .forEach((b) => (b.onclick = () => openReview(b.dataset.review)));
  root.querySelectorAll("[data-task]").forEach(
    (b) =>
      (b.onclick = async () => {
        b.disabled = true;
        try {
          await request(
            `/tasks/${b.dataset.task}`,
            { status: "COMPLETED" },
            "PATCH",
          );
          store = await snapshot();
          renderPage();
          toast("Task marked complete.");
        } catch (err) {
          b.disabled = false;
          toast(err.message);
        }
      }),
  );
  root.querySelector('[data-action="tour"]')?.addEventListener("click", () => {
    if (viewerMode) {
      page = "guide";
      shell();
      renderPage();
    } else beginViewer();
  });
}
async function openCase(caseId) {
  stopGuide();
  const epoch = ++caseEpoch;
  activeCase = store.cases.find((c) => c.id === caseId);
  conversationId = undefined;
  caseTab = "journey";
  const dialog = app.querySelector("#case-dialog");
  dialog.innerHTML = `<div class="drawer-loading"><button class="icon-button close-button" aria-label="Close case">${icon("x")}</button><div class="skeleton" style="height:44px;width:65%"></div><div class="skeleton" style="height:240px;margin-top:30px"></div></div>`;
  dialog.querySelector("button").onclick = () => dialog.close();
  if (!dialog.open) dialog.showModal();
  dialog.onclick = (e) => {
    if (e.target === dialog) dialog.close();
  };
  try {
    const [c, docs, timeline, readiness, approvals] = await Promise.all([
      request(`/cases/${caseId}`),
      request(`/cases/${caseId}/documents`),
      request(`/cases/${caseId}/timeline`),
      request(`/cases/${caseId}/readiness`),
      request(`/approvals?case_id=${caseId}`),
    ]);
    if (epoch !== caseEpoch || !dialog.open) return;
    activeCase = { ...activeCase, ...c };
    caseData = { docs, timeline, readiness, approvals };
    renderCase();
  } catch (err) {
    if (epoch === caseEpoch) {
      dialog.innerHTML = `<div class="drawer-loading"><h2>Unable to open case</h2><p>${esc(err.message)}</p>${button("Close", "data-close", "secondary", "x")}</div>`;
      dialog.querySelector("[data-close]").onclick = () => dialog.close();
    }
  }
}
function flowMarkup(c) {
  const steps = [
    ["Doctor's request", "referral_status", "file-plus"],
    ["Papers", "document_status", "files"],
    ["Coverage", "insurance_status", "shield-check"],
    ["Insurance approval", "authorization_status", "seal-check"],
    ["Visit", "scheduling_status", "calendar-check"],
    ["Care team", "clinical_status", "stethoscope"],
    ["Bill", "financial_status", "receipt"],
  ];
  return `<div class="case-flow">${steps.map(([label, key, ico], i) => `<div class="flow-step ${done(c[key]) ? "done" : ""}"><span class="flow-symbol">${icon(ico)}</span><div><strong>${label}</strong><span>${esc(pretty(c[key]))}</span></div>${done(c[key]) ? icon("check-circle", "flow-check") : ""}</div>`).join("")}</div>`;
}
function renderCase() {
  const dialog = app.querySelector("#case-dialog"),
    c = activeCase;
  const previousAnswer =
    dialog.querySelector("#assistant-answer")?.innerHTML || "";
  dialog.innerHTML = `<div class="case-drawer"><header class="case-header"><div><span class="breadcrumb">${esc(c.case_number)} / Outpatient MRI</span><h2 id="case-title">${esc(patient(c))}</h2></div><button class="icon-button" data-close aria-label="Close case">${icon("x")}</button></header><div class="case-status-row">${badge(displayStatus(c))}<span>${esc(pretty(c.priority))} priority</span><span>Version ${c.version}</span></div>${tour ? `<div class="tour-banner">${icon("play-circle")}<span><strong>Follow a care journey</strong><small>Explore the milestones, review a proposal, then ask what is blocking this case.</small></span><button class="icon-button" data-end-tour aria-label="End walkthrough">${icon("x")}</button></div>` : ""}<div class="case-tabs" role="tablist" aria-label="Case sections">${[
    ["journey", "Journey"],
    ["documents", `Documents (${caseData.docs.length})`],
    ["timeline", "Timeline"],
  ]
    .map(
      ([v, l]) =>
        `<button role="tab" id="case-tab-${v}" aria-controls="case-tab-panel" tabindex="${caseTab === v ? "0" : "-1"}" aria-selected="${caseTab === v}" data-case-tab="${v}">${l}</button>`,
    )
    .join(
      "",
    )}</div><div class="case-content" id="case-tab-panel" role="tabpanel" aria-labelledby="case-tab-${caseTab}">${
    caseTab === "journey"
      ? `<div class="readiness-card"><span class="feature-icon">${icon(caseData.readiness.administratively_ready ? "check-circle" : "flag")}</span><div><strong>${caseData.readiness.administratively_ready ? "Papers and insurance checked" : "The next step is clear."}</strong><p>${esc(caseData.readiness.blockers.map(blockerLabel).join(". ") || nextStep(c))}</p></div></div>${flowMarkup(c)}${caseData.approvals.length ? `<section class="case-approval"><h3>Prepared for your review</h3>${caseData.approvals.map((a) => `<button class="case-proposal" data-review="${esc(a.id)}"><span>${icon("sparkle")} ${esc(pretty(a.action_type))}</span>${icon("arrow-up-right")}</button>`).join("")}</section>` : ""}<div class="demo-actions"><h3>Simulate the next handoff</h3><p>Synthetic integration events only.</p><div>${button("Receive note", `data-simulate="document_received" ${c.document_status === "COMPLETE" || user.role !== "demo_admin" ? "disabled" : ""}`, "secondary", "file-plus")}${button("Payer approves", `data-simulate="authorization_approved" ${!["PENDING", "SUBMITTED"].includes(c.authorization_status) || user.role !== "demo_admin" ? "disabled" : ""}`, "secondary", "shield-check")}</div><button class="text-link next-action-link" data-next-action>Coordinate next step ${icon("arrow-right")}</button></div>`
      : caseTab === "documents"
        ? `<div class="document-list">${caseData.docs.map((d) => `<button class="document-row" data-document="${esc(d.id)}"><span class="file-symbol">${icon("file-pdf")}</span><span><strong>${esc(d.title)}</strong><small>Version ${d.version} / ${d.indexed ? "Indexed" : "Not indexed"}</small></span>${badge(d.verification_status)}${icon("arrow-up-right")}</button>`).join("") || empty("No documents yet.", "Received synthetic files will appear here.", "files")}</div>`
        : `<div class="event-timeline">${
            [...caseData.timeline]
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              .map(
                (e) =>
                  `<article><span class="timeline-symbol">${icon(/Approval|Approved/.test(e.event_type) ? "hand-palm" : "check")}</span><div><strong>${esc(pretty(e.event_type.replace(/([a-z])([A-Z])/g, "$1 $2")))}</strong><p>${esc(pretty(e.source))}</p><time>${new Date(e.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div></article>`,
              )
              .join("") ||
            empty(
              "The journey starts here.",
              "Case events will appear as the workflow progresses.",
              "clock-counter-clockwise",
            )
          }</div>`
  }</div><section class="assistant-panel"><div class="assistant-heading"><span class="feature-icon">${icon("sparkle")}</span><div><h3>CareFlow Copilot</h3><span>${connected ? "Grounded in case records" : "Case-based demo answers"}</span></div></div><div id="assistant-answer" aria-live="polite">${previousAnswer}</div><div class="question-suggestions"><button data-question="Why is this case blocked? What documents are missing?">What's blocking this case?</button><button data-question="What is the case status?">Clinical readiness?</button></div><form id="assistant-form"><label for="assistant-input" class="sr-only">Ask about this case</label><input id="assistant-input" placeholder="Ask about this care journey" maxlength="2000" required><button class="icon-button send-button" type="submit" aria-label="Send question">${icon("arrow-up")}</button></form><span class="assistant-disclaimer">${connected ? "Deterministic demo assistant." : "Scripted presentation assistant."} Verify with the care team.</span></section></div>`;
  const actions = dialog.querySelector(".demo-actions");
  if (c.external_reference) {
    const origin = document.createElement("p");
    origin.className = "case-origin";
    origin.textContent = `Referral intake: ${c.external_reference}. Patient, order and coverage were reviewed at registration.`;
    dialog.querySelector(".case-status-row").after(origin);
  }
  if (actions && !viewerMode) {
    const available = caseActions(c, user.role, caseData.approvals, caseData.docs);
    const pending = caseData.approvals[0];
    actions.innerHTML = `<h3>${c.overall_status === "FULLY_RESOLVED" ? "Journey completed" : "Your next handoff"}</h3><p>${esc(handoffHint(c, caseData.approvals, caseData.docs))}</p><div>${pending ? button("Review prepared action", `data-review="${esc(pending.id)}"`, "primary", "hand-palm") : available.length ? button(available[0][1], "data-next-action", "primary", "arrow-right") : c.overall_status !== "FULLY_RESOLVED" ? button(user.role === "clinician" ? "Choose coordinator" : "Choose clinician", "data-case-role", "secondary", "arrows-left-right") : `<span class="badge good">Fully resolved</span>`}</div><small>Synthetic records. Each completed handoff unlocks the next action.</small>`;
    actions.querySelector("[data-case-role]")?.addEventListener("click", openRolePicker);
  }
  if (viewerMode) {
    dialog.querySelector(".demo-actions")?.remove();
    dialog.querySelectorAll("[data-review]").forEach((b) => {
      b.disabled = true;
      b.title =
        "Practice workspace. Mira demonstrates approvals in the guided demo.";
    });
  }
  dialog.querySelector("[data-close]").onclick = () => {
    tour = false;
    dialog.close();
  };
  dialog
    .querySelectorAll("[data-source-document]")
    .forEach((b) => (b.onclick = () => openDocument(b.dataset.sourceDocument)));
  dialog
    .querySelectorAll("[data-source-record]")
    .forEach(
      (b) =>
        (b.onclick = () => toast(`Source record: ${b.dataset.sourceRecord}`)),
    );
  dialog.querySelector("[data-end-tour]")?.addEventListener("click", () => {
    tour = false;
    renderCase();
  });
  dialog.querySelectorAll("[data-case-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        caseTab = b.dataset.caseTab;
        renderCase();
      }),
  );
  dialog
    .querySelectorAll("[data-review]")
    .forEach((b) => (b.onclick = () => openReview(b.dataset.review)));
  dialog
    .querySelectorAll("[data-document]")
    .forEach((b) => (b.onclick = () => openDocument(b.dataset.document)));
  dialog.querySelectorAll("[data-simulate]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (loading) return;
        loading = true;
        b.disabled = true;
        try {
          await request("/demo/events", {
            case_id: c.id,
            event_type: b.dataset.simulate,
            external_event_id: `SYN-WEB-${crypto.randomUUID()}`,
          });
          await refreshCase();
          toast("Synthetic event recorded.");
        } catch (err) {
          toast(err.message);
          b.disabled = false;
        } finally {
          loading = false;
        }
      }),
  );
  dialog
    .querySelector("[data-next-action]")
    ?.addEventListener("click", openNextAction);
  dialog.querySelector("#assistant-form").onsubmit = (e) => {
    e.preventDefault();
    ask(dialog.querySelector("#assistant-input").value);
  };
  dialog
    .querySelectorAll("[data-question]")
    .forEach((b) => (b.onclick = () => ask(b.dataset.question)));
}
async function refreshCase() {
  store = await snapshot();
  renderPage();
  const [c, docs, timeline, readiness, approvals] = await Promise.all([
    request(`/cases/${activeCase.id}`),
    request(`/cases/${activeCase.id}/documents`),
    request(`/cases/${activeCase.id}/timeline`),
    request(`/cases/${activeCase.id}/readiness`),
    request(`/approvals?case_id=${activeCase.id}`),
  ]);
  activeCase = { ...activeCase, ...c };
  caseData = { docs, timeline, readiness, approvals };
  renderCase();
}
async function ask(message) {
  if (!message.trim() || loading) return;
  loading = true;
  const container = app.querySelector("#assistant-answer"),
    send = app.querySelector(".send-button");
  send.disabled = true;
  container.innerHTML = `<div class="question-bubble">${esc(message)}</div><div class="skeleton answer-skeleton"></div>`;
  try {
    const r = await request("/assistant/messages", {
      message,
      scope: "case",
      case_id: activeCase.id,
      ...(conversationId ? { conversation_id: conversationId } : {}),
    });
    conversationId = r.conversation_id;
    container.innerHTML = `<div class="question-bubble">${esc(message)}</div><div class="answer-bubble">${esc(formatAnswer(r.answer))}</div><div class="source-chips">${r.sources.map((s) => `<button ${s.document_id ? `data-source-document="${esc(s.document_id)}"` : `data-source-record="${esc(s.record_id)}"`}>${icon("link")}${esc(s.title)}${s.page ? ` / p.${s.page}` : ""}${s.version ? ` / v${s.version}` : ""}</button>`).join("")}</div>`;
    container
      .querySelectorAll("[data-source-document]")
      .forEach(
        (b) => (b.onclick = () => openDocument(b.dataset.sourceDocument)),
      );
    container
      .querySelectorAll("[data-source-record]")
      .forEach(
        (b) =>
          (b.onclick = () => toast(`Source record: ${b.dataset.sourceRecord}`)),
      );
    if (app.querySelector("#assistant-input"))
      app.querySelector("#assistant-input").value = "";
  } catch (err) {
    container.innerHTML = `<p class="error-message">${esc(err.message)}</p>`;
  } finally {
    loading = false;
    send.disabled = false;
  }
}
function proposalDetails(a) {
  return Object.entries(a.proposed_payload)
    .map(([k, v]) => {
      if (k.endsWith("_id") || k === "payload_hash") return "";
      const label =
        k === "body" || k === "message"
          ? "Message"
          : k === "source_document_ids"
            ? "Supporting sources"
            : pretty(k);
      let value = Array.isArray(v)
        ? k.endsWith("_ids")
          ? `${v.length} linked documents`
          : v.map(pretty).join(", ")
        : typeof v === "boolean"
          ? v
            ? "Yes"
            : "No"
          : typeof v === "object"
            ? Object.entries(v)
                .map(([field, value]) => `${pretty(field)}: ${value}`)
                .join(" / ")
            : k === "scheduled_at"
              ? new Date(v).toLocaleString()
              : k === "document_type"
                ? pretty(v)
                : v === "SYN-REFERRING-PROVIDER"
                  ? "Referring practice (synthetic)"
                  : v === "SYN-PAYER"
                    ? "Payer (synthetic)"
                    : v;
      return `<div><span>${esc(label)}</span><p>${esc(value)}</p></div>`;
    })
    .join("");
}
function openReview(proposalId) {
  const a =
    store.approvals.find((a) => a.id === proposalId) ||
    caseData?.approvals.find((a) => a.id === proposalId);
  if (!a) {
    toast("This proposal is no longer awaiting review.");
    return;
  }
  const dialog = app.querySelector("#document-dialog");
  dialog.innerHTML = `<div class="review-content"><header><span class="feature-icon">${icon("hand-palm")}</span><button class="icon-button" data-close aria-label="Close action review">${icon("x")}</button></header><h2 id="document-title">Review before it moves.</h2><p class="muted">${esc(pretty(a.action_type))}</p><div class="review-metadata"><span>Target<strong>${esc(pretty(a.target_system || "Simulated integration"))}</strong></span><span>Risk<strong>${esc(pretty(a.risk_level || "LOW"))}</strong></span><span>Status<strong>${esc(pretty(a.status))}</strong></span></div><div class="payload-details">${proposalDetails(a)}</div><label for="decision-reason">Decision note <span class="muted">(optional)</span></label><textarea id="decision-reason" rows="2" maxlength="500" placeholder="Add context for the audit trail"></textarea><p class="review-note">${icon("info")} ${connected ? "Approval queues a mock integration action." : "Approval records a simulated action in this browser."}</p><p class="error-message" id="decision-error" role="alert"></p><div class="review-buttons">${button("Reject", 'data-decision="reject"', "secondary", "x")}${button("Approve action", 'data-decision="approve"', "primary", "check")}</div></div>`;
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  dialog.onclick = (e) => {
    if (e.target === dialog) dialog.close();
  };
  if (!dialog.open) dialog.showModal();
  dialog.querySelectorAll("[data-decision]").forEach(
    (b) =>
      (b.onclick = async () => {
        dialog
          .querySelectorAll("[data-decision]")
          .forEach((x) => (x.disabled = true));
        try {
          const result = await request(
            `/approvals/${a.id}/${b.dataset.decision}`,
            { reason: dialog.querySelector("#decision-reason").value },
          );
          if (
            !["APPROVED", "COMPLETED", "REJECTED", "ESCALATED"].includes(
              result.status,
            )
          ) {
            throw new Error(
              `This proposal is ${pretty(result.status)}. It was not executed.`,
            );
          }
          dialog.close();
          store = await snapshot();
          shellAfterDecision();
          toast(
            b.dataset.decision === "approve"
              ? "Approval recorded. Action queued or simulated."
              : "Proposal rejected.",
          );
        } catch (err) {
          dialog.querySelector("#decision-error").textContent = err.message;
          dialog
            .querySelectorAll("[data-decision]")
            .forEach((x) => (x.disabled = false));
        }
      }),
  );
}
function shellAfterDecision() {
  app.querySelector(".nav-count").textContent = store.approvals.length;
  renderPage();
  if (app.querySelector("#case-dialog").open)
    refreshCase().catch((err) => toast(err.message));
}
async function openDocument(documentId) {
  const d = caseData?.docs.find((d) => d.id === documentId);
  if (!d) {
    toast("Open the case documents to inspect this reference.");
    return;
  }
  const dialog = app.querySelector("#document-dialog");
  dialog.innerHTML = `<div class="review-content"><header><span class="feature-icon">${icon("file-pdf")}</span><button class="icon-button" data-close aria-label="Close document">${icon("x")}</button></header><h2 id="document-title">${esc(d.title)}</h2><div class="document-meta">${badge(d.verification_status)}<span>Version ${d.version}</span><span>Synthetic document</span></div><div id="document-content" class="document-content">${connected ? '<div class="skeleton" style="height:350px"></div>' : `<div class="paper-preview"><span>CAREFLOW SYNTHETIC RECORD</span><h3>${esc(d.title)}</h3><p>${esc(d.text)}</p><small>Page 1 / Version ${d.version}</small></div>`}</div></div>`;
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  if (!dialog.open) dialog.showModal();
  if (connected) {
    try {
      const response = await fetch(`/api/v1/documents/${documentId}/content`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Document content unavailable.");
      const url = URL.createObjectURL(await response.blob());
      dialog.querySelector("#document-content").innerHTML =
        `<iframe src="${url}" title="${esc(d.title)}" class="pdf-frame"></iframe><a href="${url}" download="synthetic-document.pdf" class="text-link">Download original PDF ${icon("download-simple")}</a>`;
      dialog.addEventListener("close", () => URL.revokeObjectURL(url), {
        once: true,
      });
    } catch (err) {
      dialog.querySelector("#document-content").innerHTML =
        `<p class="error-message">${esc(err.message)}</p>`;
    }
  }
}
async function openRolePicker() {
  const dialog = app.querySelector("#document-dialog");
  try {
    const users = (await request("/auth/demo-users")).filter(
      (u) => u.tenant_id === user.tenant_id,
    );
    dialog.innerHTML = `<div class="review-content"><header><span class="feature-icon">${icon("users")}</span><button class="icon-button" data-close aria-label="Close persona picker">${icon("x")}</button></header><h2 id="document-title">A different view of care.</h2><p class="muted">Switch fictional roles within this hospital.</p><div class="role-options">${users.map((u) => `<button data-role-user="${esc(u.id)}" class="role-option"><span class="avatar">${initials(u.name)}</span><span><strong>${esc(u.name)}</strong><small>${esc(pretty(u.role))}</small></span>${u.id === user.id ? icon("check-circle") : icon("arrow-right")}</button>`).join("")}</div></div>`;
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    if (!dialog.open) dialog.showModal();
    dialog.querySelectorAll("[data-role-user]").forEach(
      (b) =>
        (b.onclick = async () => {
          try {
            user = await login(users.find((u) => u.id === b.dataset.roleUser));
            dialog.close();
            store = await snapshot();
            app.querySelector(".profile strong").textContent = user.name;
            app.querySelector(".profile small").textContent = pretty(user.role);
            app.querySelector(".profile .avatar").textContent = initials(
              user.name,
            );
            if (app.querySelector("#case-dialog").open) await refreshCase();
            toast(`Viewing as ${pretty(user.role)}.`);
          } catch (err) {
            toast(err.message);
          }
        }),
    );
  } catch (err) {
    toast(err.message);
  }
}
function openNextAction() {
  const c = activeCase,
    dialog = app.querySelector("#document-dialog");
  const actions = caseActions(c, user.role, caseData.approvals, caseData.docs);
  dialog.innerHTML = `<div class="review-content"><header><span class="feature-icon">${icon("arrows-split")}</span><button class="icon-button" data-close aria-label="Close next action">${icon("x")}</button></header><h2 id="document-title">Move the journey forward.</h2><p class="muted">Choose the next handoff for ${esc(c.case_number)}.</p><form id="next-action-form"><label for="next-action">Care action</label><div class="select-wrap"><select id="next-action" ${!actions.length ? "disabled" : ""}>${!actions.length ? "<option>Clinical milestones complete</option>" : ""}${actions.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>${icon("caret-down")}</div><div id="action-fields"></div><div class="action-clinical-note">${icon("stethoscope")} Care-team checks need the clinician profile.<button type="button" class="text-link" data-role-picker>Switch role ${icon("arrow-right")}</button></div><p class="error-message" id="next-action-error" role="alert"></p>${button("Prepare next step", `type="submit" ${!actions.length ? "disabled" : ""}`, "primary", "arrow-right")}</form></div>`;
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  dialog.querySelector("[data-role-picker]").onclick = openRolePicker;
  const fields = () => {
    const value = dialog.querySelector("#next-action").value;
    dialog.querySelector("#action-fields").innerHTML =
      value === "appointment"
        ? `<label for="appointment-date">Appointment date and time</label><input type="datetime-local" id="appointment-date" required min="${localDateValue(new Date())}" value="${localDateValue(new Date(Date.now() + 86400000))}"><label for="appointment-location">Location</label><div class="select-wrap"><select id="appointment-location"><option value="SYN-MRI-A">Synthetic MRI location A</option><option value="SYN-MRI-B">Synthetic MRI location B</option></select>${icon("caret-down")}</div><p class="action-hint">Creates a proposal. Confirming the booking still requires review.</p>`
        : value === "closure"
          ? `<label for="closure-disposition">Closure disposition</label><div class="select-wrap"><select id="closure-disposition"><option value="FULLY_RESOLVED">Fully resolved</option></select>${icon("caret-down")}</div><p class="action-hint">Clinical communication and financial follow-up are complete. Review the closure before it executes.</p>`
          : value.startsWith("clinical:")
            ? `<label class="attestation"><input type="checkbox" id="clinical-attestation" required> I am recording a sample care-team check.</label><p class="action-hint">The assistant does not make clinical decisions.</p>`
            : `<p class="action-hint">A synthetic demo event or fixture will be recorded.</p>`;
  };
  dialog.querySelector("#next-action").onchange = fields;
  fields();
  if (!dialog.open) dialog.showModal();
  dialog.querySelector("#next-action-form").onsubmit = async (e) => {
    e.preventDefault();
    const b = dialog.querySelector('[type="submit"]');
    b.disabled = true;
    const v = dialog.querySelector("#next-action").value;
    try {
      if (v === "appointment")
        await request(`/cases/${c.id}/appointments/propose`, {
          scheduled_at: new Date(
            dialog.querySelector("#appointment-date").value,
          ).toISOString(),
          location: dialog.querySelector("#appointment-location").value,
          tentative: false,
        });
      else if (v === "final_report") {
        const doc = await request(`/cases/${c.id}/documents`, {
          fixture_type: "final_report",
          variant: "standard",
        });
        await request(`/documents/${doc.id}/verify`, {});
      } else if (v.startsWith("clinical:"))
        await request(`/cases/${c.id}/clinical-milestones`, {
          milestone: v.split(":")[1],
          expected_version: c.version,
          synthetic_attestation: true,
        });
      else if (v === "closure")
        await request(`/cases/${c.id}/closure/propose`, {
          disposition: dialog.querySelector("#closure-disposition").value,
          reason: "Reviewed in the synthetic client demo",
        });
      else
        await request("/demo/events", {
          case_id: c.id,
          event_type: v,
          external_event_id: `SYN-WEB-${crypto.randomUUID()}`,
        });
      dialog.close();
      await refreshCase();
      if (["appointment", "closure"].includes(v)) {
        const proposal = caseData.approvals.find(a => a.action_type === (v === "appointment" ? "appointment_booking" : "case_closure"));
        if (proposal) openReview(proposal.id);
      }
      toast(
        ["appointment", "closure"].includes(v)
          ? "Proposal prepared for human review."
          : "Synthetic milestone recorded.",
      );
    } catch (err) {
      dialog.querySelector("#next-action-error").textContent = err.message;
      b.disabled = false;
    }
  };
}
async function openNewCase() {
  if (viewerMode) { page = 'guide'; store = await snapshot(); shell(); await renderGuide(); (await guideTools()).newCase(); return; }
  stopGuide();
  try {
    const { openIntake } = await import("./intake.js");
    await openIntake({ dialog: app.querySelector("#document-dialog"), connected, viewerMode, user, request, esc, icon, button, logout, navigate, async onCreated(c) { store = await snapshot(); page = "cases"; filter = "all"; search = ""; shell(); renderPage(); await openCase(c.id); toast("Referral registered. Follow the next handoff in this case."); } });
  } catch(err) { toast(err.message); }
}
function beginViewer() {
  stopGuide();
  enterViewer();
  guideController?.reset();
  sessionStorage.removeItem("careflow-guide-visited");
  page = "guide";
  if (location.hash.startsWith("#/app")) route();
  else navigate("/app");
}
async function renderGuide() {
  const guide = await guideTools();
  if (viewerMode && page === "guide") guide.render();
}
async function openProductHelp() {
  (await guideTools()).popup();
}
async function workspace(epoch) {
  if(viewerMode){logout();navigate("/login");return;}
  document.title = "Workspace | CareFlow AI";
  if(!viewerMode){const {mountTeam}=await import('./team-ui.js');if(epoch!==routeEpoch)return;teamController=await mountTeam({app,esc,icon,button,logo,navigate,toast,isCurrent:()=>epoch===routeEpoch});return;}
  if (!token) {
    navigate("/login");
    return;
  }
  app.innerHTML = `<div class="workspace-loading">${logo()}<div class="loading-grid"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div><p>Bringing your care journeys together...</p></div>`;
  try {
    if (viewerMode) page = "guide";
    const result = await Promise.all([request("/auth/me"), snapshot()]);
    if (epoch !== routeEpoch) return;
    [user, store] = result;
    shell();
    renderPage();
    poll = setInterval(async () => {
      if (
        viewerMode ||
        document.hidden ||
        loading ||
        app.querySelector("#document-dialog").open
      )
        return;
      try {
        if (app.querySelector("#case-dialog").open) {
          const current = await request(`/cases/${activeCase.id}`),
            pending = await request(`/approvals?case_id=${activeCase.id}`);
          if (
            current.version !== activeCase.version ||
            JSON.stringify(pending.map((a) => [a.id, a.status])) !==
              JSON.stringify(caseData.approvals.map((a) => [a.id, a.status]))
          )
            await refreshCase();
          return;
        }
        const fresh = await snapshot();
        if (JSON.stringify(fresh.summary) !== JSON.stringify(store.summary)) {
          store = fresh;
          app.querySelector(".nav-count").textContent = store.approvals.length;
          renderPage();
        }
      } catch {}
    }, 5000);
  } catch (err) {
    if (epoch !== routeEpoch) return;
    app.innerHTML = `<main class="workspace-error" id="main"><h1>Let's reconnect your workspace.</h1><p>${esc(err.message)}</p><a class="button primary" href="#/login">Sign in again ${icon("arrow-right")}</a></main>`;
  }
}
function route() {
  cleanup();
  routeEpoch++;
  queueOffset = 0;
  window.scrollTo(0, 0);
  const hash = location.hash;
  document.body.classList.toggle("app-mode", hash.startsWith("#/app"));
  if (hash.startsWith("#/app")) workspace(routeEpoch);
  else if (hash.startsWith("#/login")) loginPage(routeEpoch);
  else landing();
}
document.querySelector(".skip-link").onclick = (e) => {
  e.preventDefault();
  const main = document.querySelector("#main");
  if (main) {
    main.setAttribute("tabindex", "-1");
    main.focus();
    main.scrollIntoView();
  }
};
app.addEventListener("keydown", (e) => {
  if (
    e.target.getAttribute("role") !== "tab" ||
    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
  )
    return;
  e.preventDefault();
  const tabs = [...app.querySelectorAll("[data-case-tab]")];
  let i = tabs.indexOf(e.target);
  i =
    e.key === "Home"
      ? 0
      : e.key === "End"
        ? tabs.length - 1
        : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  const target = tabs[i].dataset.caseTab;
  caseTab = target;
  renderCase();
  app.querySelector(`[data-case-tab="${target}"]`).focus();
});
window.addEventListener("hashchange", route);
route();
