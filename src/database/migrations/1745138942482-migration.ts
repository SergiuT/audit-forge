import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1745138942482 implements MigrationInterface {
    name = 'Migration1745138942482'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "control_topic" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "slug" character varying NOT NULL, "description" character varying, "embedding" double precision array NOT NULL, CONSTRAINT "UQ_00e915c2b0e4cbea60310c8272b" UNIQUE ("name"), CONSTRAINT "UQ_a8ee114c56d59bb69097199a80b" UNIQUE ("slug"), CONSTRAINT "PK_470faf8fb6dd451f1c61a20819b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "compliance_control_topics_control_topic" ("complianceControlId" integer NOT NULL, "controlTopicId" integer NOT NULL, CONSTRAINT "PK_a0aee5244fec991647b04dbeee9" PRIMARY KEY ("complianceControlId", "controlTopicId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0494b2fe8319957106dbdc19e4" ON "compliance_control_topics_control_topic" ("complianceControlId") `);
        await queryRunner.query(`CREATE INDEX "IDX_628c272946737307d930cb8b0c" ON "compliance_control_topics_control_topic" ("controlTopicId") `);
        await queryRunner.query(`ALTER TABLE "compliance_control_topics_control_topic" ADD CONSTRAINT "FK_0494b2fe8319957106dbdc19e45" FOREIGN KEY ("complianceControlId") REFERENCES "compliance_control"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "compliance_control_topics_control_topic" ADD CONSTRAINT "FK_628c272946737307d930cb8b0c6" FOREIGN KEY ("controlTopicId") REFERENCES "control_topic"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_control_topics_control_topic" DROP CONSTRAINT "FK_628c272946737307d930cb8b0c6"`);
        await queryRunner.query(`ALTER TABLE "compliance_control_topics_control_topic" DROP CONSTRAINT "FK_0494b2fe8319957106dbdc19e45"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_628c272946737307d930cb8b0c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0494b2fe8319957106dbdc19e4"`);
        await queryRunner.query(`DROP TABLE "compliance_control_topics_control_topic"`);
        await queryRunner.query(`DROP TABLE "control_topic"`);
    }

}
