import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1744638831166 implements MigrationInterface {
    name = 'Migration1744638831166'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "integration_project" ADD "lastLogTimestamp" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "integration_project" DROP COLUMN "lastLogTimestamp"`);
    }

}
