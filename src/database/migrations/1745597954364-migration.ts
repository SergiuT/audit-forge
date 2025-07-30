import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1745597954364 implements MigrationInterface {
    name = 'Migration1745597954364'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "audit_event" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "action" character varying NOT NULL, "resourceType" character varying, "resourceId" character varying, "metadata" jsonb, "timestamp" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_481efbe8b0a403efe3f47a6528f" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "audit_event"`);
    }

}
