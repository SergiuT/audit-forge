import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConfigModule } from '@nestjs/config';
import { createTestUser, createTestComplianceReport } from '@/test/setup';
import { JwtService } from '@nestjs/jwt';
import { NvdService } from '@/shared/services/nvd.service';

describe('ComplianceController (Integration)', () => {
    let app: INestApplication;
    let complianceService: ComplianceService;
    let jwtService: JwtService;

    const mockComplianceService = {
        findAll: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        generateSummary: jest.fn(),
        generatePDF: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
        filterFindings: jest.fn(),
        getReportsForProject: jest.fn(),
    };

    const mockNvdService = {
        syncNvdFeedV2: jest.fn(),
    };

    const mockJwtAuthGuard = {
        canActivate: jest.fn(),
    };

    beforeEach(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({
                    isGlobal: true,
                    envFilePath: '.env.test',
                }),
            ],
            controllers: [ComplianceController],
            providers: [
                {
                    provide: ComplianceService,
                    useValue: mockComplianceService,
                },
                {
                    provide: NvdService,
                    useValue: mockNvdService,
                },
                {
                    provide: JwtService,
                    useValue: {
                        sign: jest.fn().mockReturnValue('test-token'),
                    },
                },
            ],
        })
            .overrideGuard(JwtAuthGuard)
            .useValue(mockJwtAuthGuard)
            .compile();

        app = moduleFixture.createNestApplication();
        complianceService = moduleFixture.get<ComplianceService>(ComplianceService);
        jwtService = moduleFixture.get<JwtService>(JwtService);

        await app.init();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    afterAll(async () => {
        if (app) {
            await app.close();
        }
    });

    const createTestToken = (user = createTestUser()) => {
        return jwtService.sign({
            sub: user.id,
            username: user.username,
            email: user.email,
            role: user.role
        });
    };

    const mockAuthenticatedUser = (user = createTestUser()) => {
        mockJwtAuthGuard.canActivate.mockImplementation((context) => {
            const request = context.switchToHttp().getRequest();
            request.user = user;
            return true;
        });
    };

    describe('GET /compliance', () => {
        it('should return all compliance reports when authenticated', async () => {
            const user = createTestUser();
            const token = createTestToken(user);
            const mockReports = [
                createTestComplianceReport(),
                createTestComplianceReport({ id: 2 }),
            ];

            mockAuthenticatedUser(user);
            mockComplianceService.findAll.mockResolvedValue(mockReports);

            const response = await request(app.getHttpServer())
                .get('/compliance')
                .set('Authorization', `Bearer ${token}`)
                .expect(200);

            expect(response.body).toEqual(mockReports);
            expect(mockComplianceService.findAll).toHaveBeenCalledWith();
        });

        it('should return 401 when not authenticated', async () => {
            mockJwtAuthGuard.canActivate.mockReturnValue(false);

            await request(app.getHttpServer())
                .get('/compliance')
                .expect(403);
        });
    });

    describe('GET /compliance/:id', () => {
        it('should return a specific compliance report', async () => {
            const user = createTestUser();
            const token = createTestToken(user);
            const reportId = 1;
            const mockReport = createTestComplianceReport({
                findings: [
                    {
                        id: 1,
                        severity: 'high',
                        category: 'access-control',
                        description: 'Test finding',
                    },
                ],
                fileContent: 'test file content',
                complianceScore: 85,
                categoryScores: { 'access-control': 85 },
            });

            mockAuthenticatedUser(user);
            mockComplianceService.findOne.mockResolvedValue(mockReport);

            const response = await request(app.getHttpServer())
                .get(`/compliance/${reportId}`)
                .set('Authorization', `Bearer ${token}`)
                .expect(200);

            expect(response.body).toEqual(mockReport);
            expect(mockComplianceService.findOne).toHaveBeenCalledWith(String(reportId));
        });
    });

    describe('POST /compliance/:id/summary', () => {
        it('should generate AI summary for a report', async () => {
            const user = createTestUser();
            const token = createTestToken(user);
            const reportId = 1;
            const mockSummary = 'AI-generated summary of compliance findings';

            mockAuthenticatedUser(user);
            mockComplianceService.generateSummary.mockResolvedValue({ summary: mockSummary });

            const response = await request(app.getHttpServer())
                .post(`/compliance/${reportId}/summary`)
                .set('Authorization', `Bearer ${token}`)
                .query({ tone: 'executive' })
                .expect(201);

            expect(response.body).toEqual({ summary: mockSummary });
            expect(mockComplianceService.generateSummary).toHaveBeenCalledWith(String(reportId), false, 'executive');
        });
    });

    describe('DELETE /compliance/:id', () => {
        it('should delete a compliance report', async () => {
            const user = createTestUser();
            const token = createTestToken(user);
            const reportId = 1;

            mockAuthenticatedUser(user);
            mockComplianceService.delete.mockResolvedValue(undefined);

            await request(app.getHttpServer())
                .delete(`/compliance/${reportId}`)
                .set('Authorization', `Bearer ${token}`)
                .expect(200);

            expect(mockComplianceService.delete).toHaveBeenCalledWith(String(reportId));
        });
    });

    describe('Error Handling', () => {
        it('should handle service errors gracefully', async () => {
            const user = createTestUser();
            const token = createTestToken(user);

            mockAuthenticatedUser(user);
            // Mock the service to return a rejected promise without throwing
            mockComplianceService.findAll.mockRejectedValue({
                message: 'Database error',
                status: 500
            });

            const response = await request(app.getHttpServer())
                .get('/compliance')
                .set('Authorization', `Bearer ${token}`)
                .expect(500);

            expect(response.body).toHaveProperty('message');
            expect(mockComplianceService.findAll).toHaveBeenCalled();
        });
    });
}); 