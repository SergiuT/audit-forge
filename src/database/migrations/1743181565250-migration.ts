import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1743181565250 implements MigrationInterface {
    name = 'Migration1743181565250'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_report" ADD "source" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_report" DROP COLUMN "source"`);
    }

}
