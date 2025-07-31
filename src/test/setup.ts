import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

// Global test utilities
export const createTestingModule = async (imports: any[] = [], providers: any[] = []) => {
    return Test.createTestingModule({
        imports: [
            ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: '.env.test',
            }),
            ...imports,
        ],
        providers,
    });
};

// Mock external services
export const mockExternalServices = {
    openai: {
        chat: {
            completions: {
                create: jest.fn(),
            },
        },
        embeddings: {
            create: jest.fn(),
        },
    },
    s3: {
        upload: jest.fn(),
        getObject: jest.fn(),
        deleteObject: jest.fn(),
    },
    aws: {
        secretsManager: {
            createSecret: jest.fn(),
            getSecretValue: jest.fn(),
        },
    },
};

// Test database configuration
export const getTestDatabaseConfig = () => ({
    type: 'postgres' as const,
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432'),
    username: process.env.TEST_DB_USERNAME || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'test_password',
    database: process.env.TEST_DB_DATABASE || 'compliance_test',
    entities: ['src/**/*.entity{.ts,.js}'],
    synchronize: true, // Only for tests
    logging: false,
    dropSchema: true, // Clean slate for each test
});

// Global test data factories
export const createTestUser = (overrides: any = {}) => ({
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    password: 'hashedpassword',
    role: 'user',
    ...overrides,
});

export const createTestProject = (overrides: any = {}) => ({
    id: 1,
    name: 'Test Project',
    ...overrides,
});

export const createTestComplianceReport = (overrides: any = {}) => ({
    id: 1,
    userId: 1,
    reportData: {
        description: 'Test report',
        details: { source: 'test' },
    },
    status: 'pending',
    fileDataKey: 'test-file-key',
    ...overrides,
});

// Global beforeAll and afterAll hooks
beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret';
    process.env.OPENAI_API_KEY = 'test-key';
});

afterAll(async () => {
    // Cleanup
    jest.clearAllMocks();
}); 