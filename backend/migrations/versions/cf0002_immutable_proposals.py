"""Bind human approval to immutable action content, including policy and expiry."""

from alembic import op

revision = "cf0002"
down_revision = "f879d7c4dce3"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    CREATE FUNCTION careflow_immutable_proposal() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF ROW(NEW.tenant_id, NEW.case_id, NEW.action_type, NEW.target_system,
             NEW.target_reference, NEW.proposed_payload, NEW.payload_hash,
             NEW.risk_level, NEW.required_permission, NEW.required_approver_role,
             NEW.case_version, NEW.expires_at, NEW.dedupe_key, NEW.revision_of)
         IS DISTINCT FROM
         ROW(OLD.tenant_id, OLD.case_id, OLD.action_type, OLD.target_system,
             OLD.target_reference, OLD.proposed_payload, OLD.payload_hash,
             OLD.risk_level, OLD.required_permission, OLD.required_approver_role,
             OLD.case_version, OLD.expires_at, OLD.dedupe_key, OLD.revision_of)
      THEN RAISE EXCEPTION 'Proposal content is immutable; create a revision';
      END IF;
      RETURN NEW;
    END; $$;
    """)
    op.execute(
        "CREATE TRIGGER immutable_proposal BEFORE UPDATE ON action_proposals FOR EACH ROW EXECUTE FUNCTION careflow_immutable_proposal()"
    )


def downgrade():
    op.execute("DROP TRIGGER immutable_proposal ON action_proposals")
    op.execute("DROP FUNCTION careflow_immutable_proposal()")
