import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1745601705831 implements MigrationInterface {
    name = 'Migration1745601705831'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "audit_event" ADD "projectId" integer`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "audit_event" DROP COLUMN "projectId"`);
    }

}
