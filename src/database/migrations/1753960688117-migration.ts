import { MigrationInterface, QueryRunner } from "typeorm";

export class AddScannedDependency1753960688117 implements MigrationInterface {
    name = 'AddScannedDependency1753960688117'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "scanned_dependency" ALTER COLUMN "dependencyType" DROP DEFAULT`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "scanned_dependency" ALTER COLUMN "dependencyType" SET DEFAULT 'prod'`);
    }

}
