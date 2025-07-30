import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1745054364804 implements MigrationInterface {
    name = 'Migration1745054364804'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_control" ADD "mappedControls" text array DEFAULT '{}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_control" DROP COLUMN "mappedControls"`);
    }

}
