import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1744602647183 implements MigrationInterface {
    name = 'Migration1744602647183'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."integration_project_type_enum" AS ENUM('github', 'gcp', 'aws')`);
        await queryRunner.query(`CREATE TABLE "integration_project" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" "public"."integration_project_type_enum" NOT NULL, "name" character varying NOT NULL, "externalId" character varying NOT NULL, "metadata" jsonb, "integrationId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_8d935030a61ce6aec0002509210" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "compliance_report" ADD "integrationProjectId" uuid`);
        await queryRunner.query(`ALTER TABLE "integration_project" ADD CONSTRAINT "FK_c19a9642f80392380379e1eb7d6" FOREIGN KEY ("integrationId") REFERENCES "integration"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "compliance_report" ADD CONSTRAINT "FK_dccd985a1e9fc44e1ec42ff42e4" FOREIGN KEY ("integrationProjectId") REFERENCES "integration_project"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_report" DROP CONSTRAINT "FK_dccd985a1e9fc44e1ec42ff42e4"`);
        await queryRunner.query(`ALTER TABLE "integration_project" DROP CONSTRAINT "FK_c19a9642f80392380379e1eb7d6"`);
        await queryRunner.query(`ALTER TABLE "compliance_report" DROP COLUMN "integrationProjectId"`);
        await queryRunner.query(`DROP TABLE "integration_project"`);
        await queryRunner.query(`DROP TYPE "public"."integration_project_type_enum"`);
    }

}
