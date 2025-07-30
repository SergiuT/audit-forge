import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1745140975925 implements MigrationInterface {
    name = 'Migration1745140975925'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_control" ADD "topicTags" text array`);
        await queryRunner.query(`ALTER TABLE "compliance_control" ADD "embedding" double precision array`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_control" DROP COLUMN "embedding"`);
        await queryRunner.query(`ALTER TABLE "compliance_control" DROP COLUMN "topicTags"`);
    }

}
