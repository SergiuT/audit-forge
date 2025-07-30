import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1745604387810 implements MigrationInterface {
    name = 'Migration1745604387810'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "audit_event" ADD CONSTRAINT "FK_33c3131edaf1292ed22c59cd88b" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "audit_event" DROP CONSTRAINT "FK_33c3131edaf1292ed22c59cd88b"`);
    }

}
