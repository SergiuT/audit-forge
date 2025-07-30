import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1742737742237 implements MigrationInterface {
    name = 'Migration1742737742237'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_report" RENAME COLUMN "fileData" TO "fileDataKey"`);
        await queryRunner.query(`ALTER TABLE "compliance_report" DROP COLUMN "fileDataKey"`);
        await queryRunner.query(`ALTER TABLE "compliance_report" ADD "fileDataKey" character varying NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_report" DROP COLUMN "fileDataKey"`);
        await queryRunner.query(`ALTER TABLE "compliance_report" ADD "fileDataKey" bytea`);
        await queryRunner.query(`ALTER TABLE "compliance_report" RENAME COLUMN "fileDataKey" TO "fileData"`);
    }

}
