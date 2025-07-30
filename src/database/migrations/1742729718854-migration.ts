import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1742729718854 implements MigrationInterface {
    name = 'Migration1742729718854'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "public"."compliance_report" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "reportData" jsonb NOT NULL, "status" character varying NOT NULL, "fileData" bytea, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_21fc5ca8140903d4ba0011ac47d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "public"."Users" ("id" SERIAL NOT NULL, "username" character varying NOT NULL, "email" character varying NOT NULL, "password" character varying NOT NULL, CONSTRAINT "UQ_ffc81a3b97dcbf8e320d5106c0d" UNIQUE ("username"), CONSTRAINT "UQ_3c3ab3f49a87e6ddb607f3c4945" UNIQUE ("email"), CONSTRAINT "PK_16d4f7d636df336db11d87413e3" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "public"."Users"`);
        await queryRunner.query(`DROP TABLE "public"."compliance_report"`);
    }

}
