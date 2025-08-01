import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateComplianceFindingTable1742750000000 implements MigrationInterface {
    name = 'CreateComplianceFindingTable1742750000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "compliance_finding" (
                "id" SERIAL NOT NULL,
                "rule" character varying NOT NULL,
                "description" character varying NOT NULL,
                "projectId" integer NOT NULL,
                "severity" character varying NOT NULL,
                "category" character varying NOT NULL DEFAULT 'Uncategorized',
                "tags" text array NOT NULL DEFAULT '{}',
                "mappedControls" text array NOT NULL DEFAULT '{}',
                "reportId" integer,
                CONSTRAINT "PK_compliance_finding_id" PRIMARY KEY ("id")
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "compliance_finding"`);
    }
}