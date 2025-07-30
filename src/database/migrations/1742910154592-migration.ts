import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1742910154592 implements MigrationInterface {
    name = 'Migration1742910154592'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_report" ALTER COLUMN "status" SET DEFAULT 'pending'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_report" ALTER COLUMN "status" DROP DEFAULT`);
    }

}
