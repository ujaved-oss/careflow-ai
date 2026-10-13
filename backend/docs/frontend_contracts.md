# Frontend connection supplement

The sibling `careflow-web` project provides the product website and client demonstration.

- `GET /api/v1/patients`: read-only PatientView directory (id, tenant_id, created_at, mrn, name, date_of_birth), using the existing read permission and signed-in hospital filter.
- `GET /api/v1/auth/me`: retains existing user fields and adds hospital_name from the user's tenant.
- Patient labels come from that directory and retain patient identity when one patient has multiple cases.
- Booking, proposals, decisions, documents, assistant messages, clinical attestations, financial events, and closure reuse existing backend operations and guards.

Live validation: two authenticated hospitals each received exactly 100 patient rows with matching tenant IDs; no patient IDs overlapped, and anonymous directory access returned 401. Ruff and mypy passed after these additive read contracts. The OpenAPI snapshot was refreshed.

The hosted frontend's independent browser simulation is labelled separately. It is not a deployment of this backend or its database. See the frontend README and VALIDATION.md for UI details.
