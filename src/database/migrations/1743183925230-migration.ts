import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1743183925230 implements MigrationInterface {
    name = 'Migration1743183925230'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_action" ADD "projectId" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "compliance_finding" ADD "projectId" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "control_checklist_item" ADD "projectId" integer NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "control_checklist_item" DROP COLUMN "projectId"`);
        await queryRunner.query(`ALTER TABLE "compliance_finding" DROP COLUMN "projectId"`);
        await queryRunner.query(`ALTER TABLE "compliance_action" DROP COLUMN "projectId"`);
    }

}
