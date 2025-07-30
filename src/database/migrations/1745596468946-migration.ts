import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1745596468946 implements MigrationInterface {
    name = 'Migration1745596468946'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_report" ADD "driftSummary" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_report" DROP COLUMN "driftSummary"`);
    }

}
