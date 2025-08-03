import { MigrationInterface, QueryRunner } from "typeorm";

export class DropIntegrationProjectId1754188827422 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_report" DROP COLUMN "integrationProjectId"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_report" ADD "integrationProjectId" uuid`);
    }
}
