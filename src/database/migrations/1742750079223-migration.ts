import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1742750079223 implements MigrationInterface {
    name = 'Migration1742750079223'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "compliance_finding"
            ADD "category" character varying NOT NULL DEFAULT 'Uncategorized'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_finding" DROP COLUMN "category"`);
    }

}
