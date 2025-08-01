import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1742840642636 implements MigrationInterface {
    name = 'Migration1742840642636'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."control_checklist_item_status_enum" AS ENUM('unresolved', 'in_progress', 'resolved')`);
        await queryRunner.query(`CREATE TABLE "control_checklist_item" ("id" SERIAL NOT NULL, "controlId" character varying NOT NULL, "status" "public"."control_checklist_item_status_enum" NOT NULL DEFAULT 'unresolved', "reportId" integer, "projectId" integer NOT NULL, CONSTRAINT "PK_9c72a8834fcefebaef4a6f3b706" PRIMARY KEY ("id"))`);        await queryRunner.query(`ALTER TABLE "control_checklist_item" ADD CONSTRAINT "FK_e85cb3552e85f79a273e048e840" FOREIGN KEY ("reportId") REFERENCES "compliance_report"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "control_checklist_item" DROP CONSTRAINT "FK_e85cb3552e85f79a273e048e840"`);
        await queryRunner.query(`DROP TABLE "control_checklist_item"`);
        await queryRunner.query(`DROP TYPE "public"."control_checklist_item_status_enum"`);
    }

}
