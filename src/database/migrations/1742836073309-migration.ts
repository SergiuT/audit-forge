import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1742836073309 implements MigrationInterface {
    name = 'Migration1742836073309'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "compliance_control" ("id" SERIAL NOT NULL, "controlId" character varying NOT NULL, "framework" character varying NOT NULL, "title" character varying NOT NULL, "description" text NOT NULL, CONSTRAINT "UQ_0f79e5d86f51f0ab4074a905e60" UNIQUE ("controlId"), CONSTRAINT "PK_cd77f60c6d44e46e3fc395e93cd" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "compliance_control"`);
    }

}
