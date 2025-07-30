import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1742749286134 implements MigrationInterface {
    name = 'Migration1742749286134'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_report" ADD "aiSummary" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_report" DROP COLUMN "aiSummary"`);
    }

}
