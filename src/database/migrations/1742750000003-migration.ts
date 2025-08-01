import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateComplianceActionTable1742750000003 implements MigrationInterface {
    name = 'CreateComplianceActionTable1742750000003'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "compliance_action" (
                "id" SERIAL NOT NULL,
                "action" character varying NOT NULL,
                "description" text,
                "status" character varying NOT NULL DEFAULT 'pending',
                "assignedTo" character varying,
                "dueDate" TIMESTAMP,
                "projectId" integer NOT NULL,
                "findingId" integer,
                CONSTRAINT "PK_compliance_action_id" PRIMARY KEY ("id")
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "compliance_action"`);
    }
}
