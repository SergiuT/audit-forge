import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1742749367077 implements MigrationInterface {
    name = 'Migration1742749367077'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_report" ADD "aiSummaryGeneratedAt" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_report" DROP COLUMN "aiSummaryGeneratedAt"`);
    }

}
