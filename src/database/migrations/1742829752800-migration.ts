import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1742829752800 implements MigrationInterface {
    name = 'Migration1742829752800'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_finding" ADD "tags" text array NOT NULL DEFAULT '{}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_finding" DROP COLUMN "tags"`);
    }

}
