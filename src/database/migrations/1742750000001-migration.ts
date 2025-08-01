import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateScannedDependencyTable1742750000001 implements MigrationInterface {
    name = 'CreateScannedDependencyTable1742750000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "scanned_dependency" (
                "id" SERIAL NOT NULL,
                "name" character varying NOT NULL,
                "version" character varying NOT NULL,
                "dependencyType" character varying NOT NULL DEFAULT 'prod',
                "vulnerabilities" jsonb,
                "reportId" integer,
                CONSTRAINT "PK_scanned_dependency_id" PRIMARY KEY ("id")
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "scanned_dependency"`);
    }
}