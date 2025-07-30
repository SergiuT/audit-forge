import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1744559968941 implements MigrationInterface {
    name = 'Migration1744559968941'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."integration_type_enum" AS ENUM('github', 'gcp', 'aws', 'cloudflare')`);
        await queryRunner.query(`CREATE TABLE "integration" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" "public"."integration_type_enum" NOT NULL, "name" character varying NOT NULL, "projectId" integer NOT NULL, "userId" integer NOT NULL, "credentials" text NOT NULL, "useManager" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f348d4694945d9dc4c7049a178a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "integration" ADD CONSTRAINT "FK_6c019f3ef4828a49fbad2c79387" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "integration" ADD CONSTRAINT "FK_e38baca49ddff880b963fcb5d08" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "integration" DROP CONSTRAINT "FK_e38baca49ddff880b963fcb5d08"`);
        await queryRunner.query(`ALTER TABLE "integration" DROP CONSTRAINT "FK_6c019f3ef4828a49fbad2c79387"`);
        await queryRunner.query(`DROP TABLE "integration"`);
        await queryRunner.query(`DROP TYPE "public"."integration_type_enum"`);
    }

}
