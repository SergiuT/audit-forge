import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1745604458748 implements MigrationInterface {
    name = 'Migration1745604458748'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "audit_event" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "audit_event" DROP COLUMN "createdAt"`);
    }

}
