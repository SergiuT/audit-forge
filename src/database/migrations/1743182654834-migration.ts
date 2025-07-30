import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1743182654834 implements MigrationInterface {
    name = 'Migration1743182654834'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "project" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_4d68b1358bb5b766d3e78f32f57" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "compliance_report" ADD "projectId" integer`);
        await queryRunner.query(`ALTER TABLE "compliance_report" ADD CONSTRAINT "FK_0f7f23f2147796247dda3ec24bc" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "compliance_report" DROP CONSTRAINT "FK_0f7f23f2147796247dda3ec24bc"`);
        await queryRunner.query(`ALTER TABLE "compliance_report" DROP COLUMN "projectId"`);
        await queryRunner.query(`DROP TABLE "project"`);
    }

}
