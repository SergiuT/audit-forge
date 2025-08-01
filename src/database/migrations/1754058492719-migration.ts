import { MigrationInterface, QueryRunner } from "typeorm";

export class RenameUsersProjectsTable1754058492719 implements MigrationInterface {
    name = 'RenameUsersProjectsTable1754058492719'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ✅ Rename the junction table from users_projects_project to users_projects
        await queryRunner.query(`ALTER TABLE "users_projects_project" RENAME TO "users_projects"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // ✅ Revert the rename
        await queryRunner.query(`ALTER TABLE "users_projects" RENAME TO "users_projects_project"`);
    }
}
