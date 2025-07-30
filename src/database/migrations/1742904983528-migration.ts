import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1742904983528 implements MigrationInterface {
    name = 'Migration1742904983528'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "control_checklist_item" ADD "assignedTo" character varying`);
        await queryRunner.query(`ALTER TABLE "control_checklist_item" ADD "dueDate" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "control_checklist_item" ADD "statusUpdatedAt" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "control_checklist_item" DROP COLUMN "statusUpdatedAt"`);
        await queryRunner.query(`ALTER TABLE "control_checklist_item" DROP COLUMN "dueDate"`);
        await queryRunner.query(`ALTER TABLE "control_checklist_item" DROP COLUMN "assignedTo"`);
    }

}
