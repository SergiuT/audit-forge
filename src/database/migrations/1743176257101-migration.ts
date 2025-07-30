import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class AddComplianceRuleTable1743176257101 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
          new Table({
            name: 'compliance_rule',
            columns: [
              { name: 'id', type: 'serial', isPrimary: true },
              { name: 'rule', type: 'varchar' },
              { name: 'description', type: 'text' },
              { name: 'severity', type: 'varchar' },
              { name: 'category', type: 'varchar' },
              { name: 'pattern', type: 'text' },
              { name: 'tags', type: 'text', isNullable: true },
              { name: 'mappedControls', type: 'text', isNullable: true },
            ],
          })
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('compliance_rule');
    }

}
