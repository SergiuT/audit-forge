import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDatabaseIndexes1753975151482 implements MigrationInterface {
    name = 'AddDatabaseIndexes1753975151482'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Users table indexes
        await queryRunner.query(`CREATE INDEX "IDX_users_email" ON "Users" ("email")`);
        await queryRunner.query(`CREATE INDEX "IDX_users_username" ON "Users" ("username")`);
        await queryRunner.query(`CREATE INDEX "IDX_users_role" ON "Users" ("role")`);

        // Refresh tokens table indexes
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_user_id" ON "refresh_tokens" ("userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_token" ON "refresh_tokens" ("token")`);
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_expires_at" ON "refresh_tokens" ("expiresAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_is_revoked" ON "refresh_tokens" ("isRevoked")`);

        // Compliance reports table indexes
        await queryRunner.query(`CREATE INDEX "IDX_compliance_reports_user_id" ON "compliance_report" ("userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_compliance_reports_status" ON "compliance_report" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_compliance_reports_created_at" ON "compliance_report" ("createdAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_compliance_reports_project_id" ON "compliance_report" ("projectId")`);

        // Compliance findings table indexes
        await queryRunner.query(`CREATE INDEX "IDX_compliance_findings_report_id" ON "compliance_finding" ("reportId")`);
        await queryRunner.query(`CREATE INDEX "IDX_compliance_findings_severity" ON "compliance_finding" ("severity")`);
        await queryRunner.query(`CREATE INDEX "IDX_compliance_findings_category" ON "compliance_finding" ("category")`);
        await queryRunner.query(`CREATE INDEX "IDX_compliance_findings_project_id" ON "compliance_finding" ("projectId")`);

        // Audit events table indexes
        await queryRunner.query(`CREATE INDEX "IDX_audit_events_user_id" ON "audit_event" ("userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_audit_events_action" ON "audit_event" ("action")`);
        await queryRunner.query(`CREATE INDEX "IDX_audit_events_created_at" ON "audit_event" ("createdAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_audit_events_project_id" ON "audit_event" ("projectId")`);

        // Integrations table indexes
        await queryRunner.query(`CREATE INDEX "IDX_integrations_user_id" ON "integration" ("userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_integrations_type" ON "integration" ("type")`);
        await queryRunner.query(`CREATE INDEX "IDX_integrations_project_id" ON "integration" ("projectId")`);

        // Projects table indexes
        await queryRunner.query(`CREATE INDEX "IDX_projects_name" ON "project" ("name")`);

        // Control checklist table indexes
        await queryRunner.query(`CREATE INDEX "IDX_control_checklist_report_id" ON "control_checklist_item" ("reportId")`);
        await queryRunner.query(`CREATE INDEX "IDX_control_checklist_status" ON "control_checklist_item" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_control_checklist_project_id" ON "control_checklist_item" ("projectId")`);
        await queryRunner.query(`CREATE INDEX "IDX_control_checklist_assigned_to" ON "control_checklist_item" ("assignedTo")`);

        // Composite indexes for high-performance queries
        await queryRunner.query(`CREATE INDEX "IDX_compliance_reports_user_status" ON "compliance_report" ("userId", "status")`);
        await queryRunner.query(`CREATE INDEX "IDX_compliance_findings_report_severity" ON "compliance_finding" ("reportId", "severity")`);
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_user_expires" ON "refresh_tokens" ("userId", "expiresAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_audit_events_user_time" ON "audit_event" ("userId", "createdAt")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop composite indexes
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_events_user_time"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refresh_tokens_user_expires"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_compliance_findings_report_severity"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_compliance_reports_user_status"`);

        // Drop control checklist indexes
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_control_checklist_assigned_to"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_control_checklist_project_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_control_checklist_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_control_checklist_report_id"`);

        // Drop projects indexes
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_projects_created_at"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_projects_name"`);

        // Drop integrations indexes
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_integrations_project_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_integrations_type"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_integrations_user_id"`);

        // Drop audit events indexes
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_events_project_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_events_created_at"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_events_action"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_events_user_id"`);

        // Drop compliance findings indexes
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_compliance_findings_project_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_compliance_findings_category"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_compliance_findings_severity"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_compliance_findings_report_id"`);

        // Drop compliance reports indexes
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_compliance_reports_project_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_compliance_reports_created_at"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_compliance_reports_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_compliance_reports_user_id"`);

        // Drop refresh tokens indexes
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refresh_tokens_is_revoked"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refresh_tokens_expires_at"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refresh_tokens_token"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refresh_tokens_user_id"`);

        // Drop users indexes
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_role"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_username"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email"`);
    }
}