import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1745033761116 implements MigrationInterface {
    name = 'Migration1745033761116'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."compliance_rule_source_enum" AS ENUM('INTERNAL', 'NVD', 'CIS', 'CUSTOM')`);
        await queryRunner.query(`ALTER TABLE "compliance_rule" ADD "source" "public"."compliance_rule_source_enum" NOT NULL DEFAULT 'INTERNAL'`);
        await queryRunner.query(`ALTER TABLE "compliance_rule" ADD "cveId" character varying`);
        await queryRunner.query(`ALTER TABLE "compliance_rule" ADD "affectedService" character varying`);
        await queryRunner.query(`ALTER TABLE "compliance_rule" ADD "metadata" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_rule" DROP COLUMN "metadata"`);
        await queryRunner.query(`ALTER TABLE "compliance_rule" DROP COLUMN "affectedService"`);
        await queryRunner.query(`ALTER TABLE "compliance_rule" DROP COLUMN "cveId"`);
        await queryRunner.query(`ALTER TABLE "compliance_rule" DROP COLUMN "source"`);
        await queryRunner.query(`DROP TYPE "public"."compliance_rule_source_enum"`);
    }

}
