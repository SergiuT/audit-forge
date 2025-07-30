import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1744628916001 implements MigrationInterface {
    name = 'Migration1744628916001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "integration_project" ADD "lastScannedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "integration_project" ADD "lastRunId" bigint`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "integration_project" DROP COLUMN "lastRunId"`);
        await queryRunner.query(`ALTER TABLE "integration_project" DROP COLUMN "lastScannedAt"`);
    }

}
