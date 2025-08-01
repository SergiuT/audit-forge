import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplianceService } from './compliance.service';
import { ComplianceReport } from './entities/compliance-report.entity';
import { ComplianceFinding } from './entities/compliance-finding.entity';
import { ComplianceAction } from './entities/compliance-action.entity';
import { ComplianceRule } from './entities/compliance-rule.entity';
import { ControlTopic } from './entities/control-topic.entity';
import { Project } from '../project/entities/project.entity';
import { S3Service } from '@/shared/services/s3.service';
import { ChecklistService } from '../checklist/checklist.service';
import { PdfService } from '@/shared/services/pdf.service';
import { OpenAIService } from '@/shared/services/openai.service';
import { AuditTrailService } from '../audit-trail/audit.service';
import { createTestProject, createTestComplianceReport, createTestUser } from '@/test/setup';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SeverityOptions } from '@/shared/types/types';
import { ComplianceReportService } from './services/compliance-report.service';
import { ComplianceAnalysisService } from './services/compliance-analysis.service';
import { In } from 'typeorm';

describe('ComplianceService', () => {
    let service: ComplianceService;
    let complianceReportRepository: Repository<ComplianceReport>;
    let findingRepository: Repository<ComplianceFinding>;
    let actionRepository: Repository<ComplianceAction>;
    let ruleRepository: Repository<ComplianceRule>;
    let controlTopicRepository: Repository<ControlTopic>;
    let projectRepository: Repository<Project>;
    let s3Service: S3Service;
    let openaiService: OpenAIService;
    let auditTrailService: AuditTrailService;
    let complianceReportService: ComplianceReportService;

    const mockComplianceReportRepository = {
        find: jest.fn(),
        findOne: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        create: jest.fn(),
        remove: jest.fn(),
        createQueryBuilder: jest.fn(() => ({
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getMany: jest.fn(),
            getOne: jest.fn(),
        })),
    };

    const mockFindingRepository = {
        find: jest.fn(),
        save: jest.fn(),
        createQueryBuilder: jest.fn(() => ({
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getMany: jest.fn(),
        })),
    };

    const mockActionRepository = {
        find: jest.fn(),
        save: jest.fn(),
    };

    const mockComplianceReportService = {
        findAll: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        generateSummary: jest.fn(),
        generatePDF: jest.fn(),
    };

    const mockRuleRepository = {
        find: jest.fn(),
        save: jest.fn(),
    };

    const mockControlTopicRepository = {
        find: jest.fn(),
    };

    const mockProjectRepository = {
        find: jest.fn(),
        findOne: jest.fn(),
        findOneBy: jest.fn(),
    };

    const mockS3Service = {
        uploadFile: jest.fn(),
        getFile: jest.fn(),
        deleteFile: jest.fn(),
        generateKey: jest.fn().mockReturnValue('test-key'),
    };

    const mockChecklistService = {
        createChecklistItemsForReport: jest.fn(),
        getChecklistMetrics: jest.fn().mockResolvedValue({
            resolved: 2,
            inProgress: 1,
            unresolved: 3,
            completion: 50,
            totalControls: 6,
            highSeverity: 2,
            mediumSeverity: 2,
            lowSeverity: 2,
            controlsBySeverity: {
                high: ['CC6.1', 'CC6.2'],
                medium: ['CC7.1', 'CC7.2'],
                low: ['CC8.1', 'CC8.2'],
            },
            severityByControl: {
                'CC6.1': 'high',
                'CC6.2': 'high',
                'CC7.1': 'medium',
                'CC7.2': 'medium',
                'CC8.1': 'low',
                'CC8.2': 'low',
            },
        }),
    };

    const mockPdfService = {
        generateComplianceReport: jest.fn(),
    };

    const mockOpenAIService = {
        generateComplianceSummary: jest.fn(),
        generateCustomSummary: jest.fn(),
        getEmbedding: jest.fn(),
    };

    const mockAuditTrailService = {
        logEvent: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ComplianceService,
                {
                    provide: getRepositoryToken(ComplianceReport),
                    useValue: mockComplianceReportRepository,
                },
                {
                    provide: getRepositoryToken(Project),
                    useValue: mockProjectRepository,
                },
                {
                    provide: getRepositoryToken(ComplianceFinding),
                    useValue: mockFindingRepository,
                },
                {
                    provide: getRepositoryToken(ComplianceAction),
                    useValue: mockActionRepository,
                },
                {
                    provide: getRepositoryToken(ComplianceRule),
                    useValue: mockRuleRepository,
                },
                {
                    provide: getRepositoryToken(ControlTopic),
                    useValue: mockControlTopicRepository,
                },
                {
                    provide: S3Service,
                    useValue: mockS3Service,
                },
                {
                    provide: ChecklistService,
                    useValue: mockChecklistService,
                },
                {
                    provide: PdfService,
                    useValue: mockPdfService,
                },
                {
                    provide: OpenAIService,
                    useValue: mockOpenAIService,
                },
                {
                    provide: ComplianceReportService,
                    useValue: mockComplianceReportService,
                },
                {
                    provide: AuditTrailService,
                    useValue: mockAuditTrailService,
                },
            ],
        }).compile();

        service = module.get<ComplianceService>(ComplianceService);
        complianceReportRepository = module.get<Repository<ComplianceReport>>(getRepositoryToken(ComplianceReport));
        findingRepository = module.get<Repository<ComplianceFinding>>(getRepositoryToken(ComplianceFinding));
        actionRepository = module.get<Repository<ComplianceAction>>(getRepositoryToken(ComplianceAction));
        ruleRepository = module.get<Repository<ComplianceRule>>(getRepositoryToken(ComplianceRule));
        controlTopicRepository = module.get<Repository<ControlTopic>>(getRepositoryToken(ControlTopic));
        projectRepository = module.get<Repository<Project>>(getRepositoryToken(Project));
        s3Service = module.get<S3Service>(S3Service);
        openaiService = module.get<OpenAIService>(OpenAIService);
        auditTrailService = module.get<AuditTrailService>(AuditTrailService);
        complianceReportService = module.get<ComplianceReportService>(ComplianceReportService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('findAll', () => {
        const user = createTestUser();
        it('should return all compliance reports when no projectId is provided', async () => {
            const mockReports = [createTestComplianceReport(), createTestComplianceReport({ id: 2 })];
            mockComplianceReportRepository.find.mockResolvedValue(mockReports);

            const result = await complianceReportService.findAll(user);

            expect(result).toEqual(mockReports);
            expect(mockComplianceReportRepository.find).toHaveBeenCalledWith();
        });

        it('should return compliance reports filtered by projectId', async () => {
            const mockReports = [createTestComplianceReport()];
            mockComplianceReportRepository.find.mockResolvedValue(mockReports);

            const result = await complianceReportService.findAll(user);

            expect(result).toEqual(mockReports);
            expect(mockComplianceReportRepository.find).toHaveBeenCalledWith({
                where: { project: { id: In(user.projects.map(p => p.id)) } },
                relations: ['findings', 'findings.actions', 'project'],
            });
        });
    });

    describe('findOne', () => {
        const user = createTestUser();
        it('should return a compliance report with findings and file content', async () => {
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
                project: createTestProject(),
            });
            const mockFileContent = 'test file content';

            mockComplianceReportRepository.findOne.mockResolvedValue(mockReport);
            mockS3Service.getFile.mockResolvedValue(Buffer.from(mockFileContent));

            const result = await complianceReportService.findOne(reportId, user);

            expect(result).toHaveProperty('fileContent', mockFileContent);
            expect(result).toHaveProperty('findings', mockReport.findings);
            expect(result).toHaveProperty('complianceScore');
            expect(result).toHaveProperty('categoryScores');
            expect(mockComplianceReportRepository.findOne).toHaveBeenCalledWith({
                where: { id: reportId },
                relations: ['findings', 'findings.actions', 'project'],
            });
        });

        it('should throw NotFoundException when report is not found', async () => {
            const reportId = 999;
            mockComplianceReportRepository.findOne.mockResolvedValue(null);

            await expect(complianceReportService.findOne(reportId, user)).rejects.toThrow(NotFoundException);
            expect(mockComplianceReportRepository.findOne).toHaveBeenCalledWith({
                where: { id: reportId },
                relations: ['findings', 'findings.actions', 'project'],
            });
        });

        it('should handle S3 file retrieval errors gracefully', async () => {
            const reportId = 1;
            const mockReport = createTestComplianceReport();
            mockComplianceReportRepository.findOne.mockResolvedValue(mockReport);
            mockS3Service.getFile.mockRejectedValue(new Error('S3 error'));

            await expect(complianceReportService.findOne(reportId, user)).rejects.toThrow(BadRequestException);
        });
    });

    describe('create', () => {
        const user = createTestUser();
        it.skip('should create a new compliance report with file upload', async () => {
            const userId = 1;
            const projectId = 1;
            const mockFile: Express.Multer.File = {
                fieldname: 'file',
                originalname: 'test.txt',
                encoding: '7bit',
                mimetype: 'text/plain',
                size: 1024,
                buffer: Buffer.from('test content'),
                stream: null as any,
                destination: '',
                filename: '',
                path: '',
            };

            const createReportDto = {
                reportData: {
                    description: 'Test report',
                    details: { source: 'test' },
                },
                projectId,
                userId,
                status: 'pending',
                fileDataKey: '',
            };

            const mockSavedReport = createTestComplianceReport();
            const mockUploadResult = 'test-file-key';
            const mockProject = { ...createTestProject(), id: 1 };

            // Mock all dependencies
            mockProjectRepository.findOneBy.mockResolvedValue(mockProject);
            mockS3Service.uploadFile.mockResolvedValue(mockUploadResult);
            mockComplianceReportRepository.create.mockReturnValue(mockSavedReport);
            mockComplianceReportRepository.save.mockResolvedValue(mockSavedReport);
            mockOpenAIService.generateComplianceSummary.mockResolvedValue('AI summary');
            mockChecklistService.createChecklistItemsForReport.mockResolvedValue(undefined);
            mockRuleRepository.find.mockResolvedValue([]); // No rules to avoid complex logic
            mockFindingRepository.save.mockResolvedValue([]);
            mockActionRepository.save.mockResolvedValue([]);

            const result = await service.create(createReportDto, mockFile, user);

            expect(result).toEqual(mockSavedReport);
            expect(mockS3Service.uploadFile).toHaveBeenCalledWith(mockFile, expect.any(String));
            expect(mockComplianceReportRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    ...createReportDto,
                    fileDataKey: mockUploadResult,
                })
            );
        });

        it('should handle file upload errors', async () => {
            const userId = 1;
            const user = createTestUser();
            const mockFile: Express.Multer.File = {
                fieldname: 'file',
                originalname: 'test.txt',
                encoding: '7bit',
                mimetype: 'text/plain',
                size: 1024,
                buffer: Buffer.from('test content'),
                stream: null as any,
                destination: '',
                filename: '',
                path: '',
            };

            const createReportDto = {
                reportData: {
                    description: 'Test report',
                    details: { source: 'test' }
                },
                projectId: 1,
                userId,
                status: 'pending',
                fileDataKey: '',
            };

            mockS3Service.uploadFile.mockRejectedValue(new Error('Upload failed'));

            await expect(service.create(createReportDto, mockFile, user)).rejects.toThrow();
        });
    });

    describe('generateSummary', () => {
        const user = createTestUser();
        it('should generate AI summary for a compliance report', async () => {
            const reportId = 1;
            const tone = 'executive';
            const mockReport = createTestComplianceReport({
                findings: [
                    {
                        id: 1,
                        severity: 'high',
                        category: 'access-control',
                        description: 'Test finding',
                    },
                ],
            });
            const mockSummary = 'Executive summary of compliance findings';

            mockComplianceReportRepository.findOne.mockResolvedValue(mockReport);
            mockS3Service.getFile.mockResolvedValue(Buffer.from('test file content'));
            mockOpenAIService.generateComplianceSummary.mockResolvedValue(mockSummary);
            mockComplianceReportRepository.save.mockResolvedValue(mockReport);

            const result = await service.generateSummary(reportId, false, tone, user);

            expect(result).toEqual({ summary: mockSummary });
            expect(mockOpenAIService.generateComplianceSummary).toHaveBeenCalledWith(
                expect.stringContaining('Test finding')
            );
        });

        it('should return cached summary if available and not regenerating', async () => {
            const reportId = 1;
            const tone = 'executive';
            const mockReport = createTestComplianceReport({
                aiSummary: 'Cached summary',
                aiSummaryGeneratedAt: new Date(),
            });

            mockComplianceReportRepository.findOne.mockResolvedValue(mockReport);

            const result = await service.generateSummary(reportId, false, tone, user);

            expect(result).toEqual({ summary: 'Cached summary' });
            expect(mockOpenAIService.generateComplianceSummary).not.toHaveBeenCalled();
        });

        it('should regenerate summary when regenerate flag is true', async () => {
            const reportId = 1;
            const tone = 'executive';
            const mockReport = createTestComplianceReport({
                aiSummary: 'Old summary',
                aiSummaryGeneratedAt: new Date(),
                findings: [
                    {
                        id: 1,
                        severity: 'high',
                        category: 'access-control',
                        description: 'Test finding',
                    },
                ],
            });
            const newSummary = 'New AI summary';

            mockComplianceReportRepository.findOne.mockResolvedValue(mockReport);
            mockS3Service.getFile.mockResolvedValue(Buffer.from('test file content'));
            mockOpenAIService.generateComplianceSummary.mockResolvedValue(newSummary);
            mockComplianceReportRepository.save.mockResolvedValue(mockReport);

            const result = await service.generateSummary(reportId, true, tone, user);

            expect(result).toEqual({ summary: newSummary });
            expect(mockOpenAIService.generateComplianceSummary).toHaveBeenCalled();
        });
    });

    describe('generatePDF', () => {
        const user = createTestUser();
        it('should generate PDF for a compliance report', async () => {
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
            });
            const mockPdfBuffer = Buffer.from('PDF content');
            const mockFileContent = Buffer.from('test file content');

            mockComplianceReportRepository.findOne.mockResolvedValue(mockReport);
            mockS3Service.getFile.mockResolvedValue(mockFileContent);
            mockPdfService.generateComplianceReport.mockResolvedValue(mockPdfBuffer);

            const result = await service.generatePDF(reportId, user);

            expect(result).toEqual(mockPdfBuffer);
            expect(mockPdfService.generateComplianceReport).toHaveBeenCalledWith(expect.objectContaining({
                findings: expect.any(Array),
                categoryScores: expect.any(Object),
            }));
        });

        it('should throw NotFoundException when report not found', async () => {
            const reportId = 999;
            mockComplianceReportRepository.findOne.mockResolvedValue(null);

            await expect(service.generatePDF(reportId, user)).rejects.toThrow(NotFoundException);
        });
    });

    describe('saveFindings', () => {
        it('should save findings for a report', async () => {
            const reportId = 1;
            const mockReport = createTestComplianceReport();

            const findings = [
                {
                    severity: SeverityOptions.HIGH,
                    category: 'access-control',
                    description: 'Test finding',
                    mappedControls: ['SOC2-CC6.1'],
                    projectId: 1,
                    rule: 'test-rule',
                    actions: [],
                    tags: [],
                    report: mockReport,
                },
            ];

            mockFindingRepository.save.mockResolvedValue(findings);

            await service.saveFindings({ reportId, findings });

            expect(mockFindingRepository.save).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        reportId,
                        severity: 'high',
                        category: 'access-control',
                    }),
                ])
            );
        });
    });

    describe('delete', () => {
        const user = createTestUser();
        it('should delete a compliance report', async () => {
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
            });
            const mockFileContent = Buffer.from('test file content');

            // Mock findOne to return the enhanced object that the service expects
            mockComplianceReportRepository.findOne.mockResolvedValue({
                ...mockReport,
                fileContent: 'test file content',
                complianceScore: 0,
                categoryScores: { 'access-control': 0 },
            });
            mockS3Service.getFile.mockResolvedValue(mockFileContent);
            mockComplianceReportRepository.delete.mockResolvedValue({ affected: 1 });
            mockS3Service.deleteFile.mockResolvedValue(undefined);

            await complianceReportService.delete(reportId, user);

            expect(mockComplianceReportRepository.delete).toHaveBeenCalledWith({ id: reportId, userId: user.id });
        });

        it('should throw NotFoundException when report not found', async () => {
            const reportId = 999;
            mockComplianceReportRepository.findOne.mockResolvedValue(null);

            await expect(complianceReportService.delete(reportId, user)).rejects.toThrow(NotFoundException);
        });
    });
}); 