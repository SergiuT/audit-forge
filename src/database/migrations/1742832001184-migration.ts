import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1742832001184 implements MigrationInterface {
    name = 'Migration1742832001184'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "tag_explanation" ("id" SERIAL NOT NULL, "tag" character varying NOT NULL, "explanation" text NOT NULL, "generatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_d24f1a44713823e19ad6563e2db" UNIQUE ("tag"), CONSTRAINT "PK_0769dcd4ad1680048cd13ca9ef7" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "tag_explanation"`);
    }

}
