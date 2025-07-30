import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1745035686116 implements MigrationInterface {
    name = 'Migration1745035686116'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_rule" DROP COLUMN "name"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_rule" ADD "name" character varying`);
    }

}
