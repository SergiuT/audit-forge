import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1744713729162 implements MigrationInterface {
    name = 'Migration1744713729162'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "integration_project" ADD "includedInScans" boolean NOT NULL DEFAULT true`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "integration_project" DROP COLUMN "includedInScans"`);
    }

}
