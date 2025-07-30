import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';
config();

const configService = new ConfigService();


const AppDataSource = new DataSource({
  type: 'postgres',
  host: configService.get<string>('DATABASE_HOST'),
  port: 5432,
  username: 'compliance_user',
  password: 'compliance-1A!',
  database: 'compliance_db',
  synchronize: false,
  entities: ['**/*.entity.ts'],
  migrations: ['src/database/migrations/*-migration.ts'],
  migrationsRun: false,
  logging: true,
  schema: 'public',
});

export default AppDataSource;