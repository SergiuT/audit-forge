import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1743321830392 implements MigrationInterface {
    name = 'Migration1743321830392'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "users_projects_project" ("usersId" integer NOT NULL, "projectId" integer NOT NULL, CONSTRAINT "PK_a7a3fc20ac922a7088e7b58f92d" PRIMARY KEY ("usersId", "projectId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d007bc9a58a22fcb46e38b6a2d" ON "users_projects_project" ("usersId") `);
        await queryRunner.query(`CREATE INDEX "IDX_b0bc260301bbda93e0df0142fd" ON "users_projects_project" ("projectId") `);
        await queryRunner.query(`CREATE TYPE "public"."Users_role_enum" AS ENUM('admin', 'user')`);
        await queryRunner.query(`ALTER TABLE "Users" ADD "role" "public"."Users_role_enum" NOT NULL DEFAULT 'user'`);
        await queryRunner.query(`ALTER TABLE "users_projects_project" ADD CONSTRAINT "FK_d007bc9a58a22fcb46e38b6a2dc" FOREIGN KEY ("usersId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "users_projects_project" ADD CONSTRAINT "FK_b0bc260301bbda93e0df0142fd7" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users_projects_project" DROP CONSTRAINT "FK_b0bc260301bbda93e0df0142fd7"`);
        await queryRunner.query(`ALTER TABLE "users_projects_project" DROP CONSTRAINT "FK_d007bc9a58a22fcb46e38b6a2dc"`);
        await queryRunner.query(`ALTER TABLE "Users" DROP COLUMN "role"`);
        await queryRunner.query(`DROP TYPE "public"."Users_role_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b0bc260301bbda93e0df0142fd"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d007bc9a58a22fcb46e38b6a2d"`);
        await queryRunner.query(`DROP TABLE "users_projects_project"`);
    }

}
