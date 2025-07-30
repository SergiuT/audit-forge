import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1745037686667 implements MigrationInterface {
    name = 'Migration1745037686667'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_rule" ALTER COLUMN "pattern" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_rule" ALTER COLUMN "pattern" SET NOT NULL`);
    }

}
