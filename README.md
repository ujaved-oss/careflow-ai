# CareFlow AI

Complete source handoff for the fictional hospital case-management demonstration.

Published demo: https://careflow-ai-usman.adeena9282733.chatgpt.site/

**15 October update:** this repository contains the newer agent explanations and walkthrough fixes. The existing hosted Site has not been updated with these changes. Run this version locally; GitHub Actions validates it but does not deploy it.

## What's included

| Folder | Contents |
| --- | --- |
| `web/` | Current website, guided demo, staff screens, all ten simulated AI capabilities, Node local API, Cloudflare Worker API, SQLite/D1 persistence, migrations, assets, tests and build scripts. |
| `backend/` | Earlier FastAPI/PostgreSQL service, event-driven specialist agents, human approvals, worker, synthetic fixtures, migrations, API contracts, tests, Docker configuration and Windows launchers. |

**The published website uses `web/server/`, not the Python service.** Both implementations are retained in full. Their databases are separate; uploading this repository does not connect them or move the hosted database.

AI uses deterministic simulations and fictional data. No paid API is required. There is no live insurer, hospital, email or payment connection.

## Run the current demo

Requires Node.js 24 or later and npm. In the `web` folder:

```sh
npm ci
npm run dev:team
```

In another terminal, in the same folder:

```sh
npm run dev
```

Open http://127.0.0.1:5173/. The local API listens on loopback port 8788 and creates its own empty SQLite workspace. The local owner identity is for development only.

On Windows, `web/scripts/start-local.ps1` starts the same services in hidden processes; `stop-local.ps1` stops them.

For the presentation, choose **Start guided case**, then **Start the case**. The fictional referral is prepared automatically and waits for **Approve and create case**. Follow the highlighted staff actions through closure. Approval boxes and later saves still belong to the user.

Use **AI agents** in the workspace header to explain all ten capabilities. Each card shows the old task, what the agent prepares, and what staff must check. During the guided case, Mira introduces the relevant agent at each step. The final results sheet lists the capabilities actually demonstrated. See the [walkthrough audit](web/docs/demo-audit-2026-10-15.md) for verified behavior and limits.

```sh
npm run check
npm test
npm run build
```

The build generates the frontend and Worker bundle, embedded assets and migrations. Build output is regenerated rather than committed. `.openai/hosting.json` retains the existing Sites project binding; publishing through Sites is a separate operation. A generic Cloudflare deployment requires its own D1 binding and trusted identity integration. Do not expose the local development server as production authentication.

## Run the earlier Python backend

See [`backend/README.md`](backend/README.md) for the complete setup, API persona selection, worker and full workflow replay.

On Windows with Python 3.12 or later:

```powershell
cd backend
.\scripts\start-local.ps1
```

This installs dependencies, prepares a local PostgreSQL instance, migrates and seeds fictional fixtures, and starts the API and worker. Open http://127.0.0.1:8000/docs. It does not change the current website's cases.

Docker alternative, from `backend`:

```sh
docker compose up --build -d
```

The sample environment file has demo-only defaults, not real credentials. Never use those defaults with real patient data or a production service.

## Validation and source completeness

`SOURCE-MANIFEST.json` lists SHA-256 hashes for the current web and Python source/handoff files, including lockfiles, fixtures, documentation and migrations. This update builds on published version 12, source commit `8dda4191ede32ea45a4b32209c3ce9b89a49b6b1`; it is a newer local/GitHub snapshot.

Current validation is recorded in the [15 October audit](web/docs/demo-audit-2026-10-15.md). Backend historical validation and its limits are in [`backend/docs/validation.md`](backend/docs/validation.md). Older sections inside component documentation describe prior releases; this root document explains the current architecture and automatic opening.

GitHub Actions validates the web build and runs backend checks and tests against an isolated PostgreSQL test database. It does not publish the site or access production data.

Installed dependencies, virtual environments, local/hosted case databases, session data, secrets, logs, generated builds and generated document storage are excluded. Lockfiles and seed generators allow dependencies and synthetic fixtures to be recreated.
