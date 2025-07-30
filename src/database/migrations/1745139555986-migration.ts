import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1745139555986 implements MigrationInterface {
    name = 'Migration1745139555986'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "control_topic" RENAME COLUMN "name" TO "label"`);
        await queryRunner.query(`ALTER TABLE "control_topic" RENAME CONSTRAINT "UQ_00e915c2b0e4cbea60310c8272b" TO "UQ_99a54b70322ff753cb08b8ffbad"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "control_topic" RENAME CONSTRAINT "UQ_99a54b70322ff753cb08b8ffbad" TO "UQ_00e915c2b0e4cbea60310c8272b"`);
        await queryRunner.query(`ALTER TABLE "control_topic" RENAME COLUMN "label" TO "name"`);
    }

}
