import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1744613621802 implements MigrationInterface {
    name = 'Migration1744613621802'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."integration_type_enum" RENAME TO "integration_type_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."integration_type" AS ENUM('gcp', 'aws', 'github', 'cloudflare', 'other')`);
        await queryRunner.query(`ALTER TABLE "integration" ALTER COLUMN "type" TYPE "public"."integration_type" USING "type"::"text"::"public"."integration_type"`);
        await queryRunner.query(`DROP TYPE "public"."integration_type_enum_old"`);
        await queryRunner.query(`ALTER TYPE "public"."integration_project_type_enum" RENAME TO "integration_project_type_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."integration_type_enum" AS ENUM('gcp', 'aws', 'github', 'cloudflare', 'other')`);
        await queryRunner.query(`ALTER TABLE "integration_project" ALTER COLUMN "type" TYPE "public"."integration_type_enum" USING "type"::"text"::"public"."integration_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."integration_project_type_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."integration_project_type_enum_old" AS ENUM('gcp', 'aws', 'github', 'cloudflare', 'other')`);
        await queryRunner.query(`ALTER TABLE "integration_project" ALTER COLUMN "type" TYPE "public"."integration_project_type_enum_old" USING "type"::"text"::"public"."integration_project_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."integration_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."integration_project_type_enum_old" RENAME TO "integration_project_type_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."integration_type_enum_old" AS ENUM('gcp', 'aws', 'github', 'cloudflare', 'other')`);
        await queryRunner.query(`ALTER TABLE "integration" ALTER COLUMN "type" TYPE "public"."integration_type_enum_old" USING "type"::"text"::"public"."integration_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."integration_type"`);
        await queryRunner.query(`ALTER TYPE "public"."integration_type_enum_old" RENAME TO "integration_type_enum"`);
    }

}
