import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1745034252726 implements MigrationInterface {
    name = 'Migration1745034252726'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_rule" ADD "name" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_rule" DROP COLUMN "name"`);
    }

}
