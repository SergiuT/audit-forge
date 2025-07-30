import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1745161163860 implements MigrationInterface {
    name = 'Migration1745161163860'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_control" ADD "embedding" double precision array`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_control" DROP COLUMN "embedding"`);
    }

}
