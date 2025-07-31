import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { S3Service } from './s3.service';
import { RetryService } from './retry.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3');

describe('S3Service', () => {
    let service: S3Service;
    let retryService: jest.Mocked<RetryService>;
    let circuitBreakerService: jest.Mocked<CircuitBreakerService>;
    let configService: jest.Mocked<ConfigService>;
    let mockS3Client: jest.Mocked<S3Client>;

    const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: Buffer.from('test content'),
        size: 12,
        stream: new Readable(),
        destination: '',
        filename: '',
        path: '',
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                S3Service,
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn((key: string) => {
                            const config = {
                                AWS_REGION: 'us-east-1',
                                AWS_ACCESS_KEY: 'test-key',
                                AWS_SECRET_ACCESS_KEY: 'test-secret',
                                S3_BUCKET_NAME: 'test-bucket',
                            };
                            return config[key];
                        }),
                    },
                },
                {
                    provide: RetryService,
                    useValue: {
                        withRetry: jest.fn(),
                    },
                },
                {
                    provide: CircuitBreakerService,
                    useValue: {
                        execute: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<S3Service>(S3Service);
        retryService = module.get(RetryService);
        circuitBreakerService = module.get(CircuitBreakerService);
        configService = module.get(ConfigService);

        // Mock S3Client
        mockS3Client = {
            send: jest.fn(),
        } as any;

        // Set the mocked client
        (service as any).s3Client = mockS3Client;
        (service as any).bucket = 'test-bucket';
        (service as any).isConfigured = true;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('uploadFile', () => {
        it('should successfully upload file with retry and circuit breaker', async () => {
            const key = 'test-key';
            const expectedResult = 'test-key';

            // Mock the retry service to actually call the circuit breaker
            retryService.withRetry.mockImplementation(async ({ execute }) => {
                return circuitBreakerService.execute('s3-upload', execute);
            });
            circuitBreakerService.execute.mockResolvedValue(expectedResult);

            const result = await service.uploadFile(mockFile, key);

            expect(result).toBe(expectedResult);
            expect(retryService.withRetry).toHaveBeenCalledWith({
                execute: expect.any(Function),
                maxRetries: 3,
                retryDelay: expect.any(Function),
            });
            expect(circuitBreakerService.execute).toHaveBeenCalledWith('s3-upload', expect.any(Function));
        });

        it('should handle upload failures with retry', async () => {
            const key = 'test-key';
            const error = new Error('S3 upload failed');

            // Mock retry service to simulate failures then success
            retryService.withRetry.mockImplementation(async ({ execute }) => {
                // Simulate the circuit breaker execution
                return circuitBreakerService.execute('s3-upload', execute);
            });

            // Mock circuit breaker to throw error
            circuitBreakerService.execute.mockRejectedValue(error);

            await expect(service.uploadFile(mockFile, key)).rejects.toThrow('S3 upload failed');

            expect(retryService.withRetry).toHaveBeenCalledWith({
                execute: expect.any(Function),
                maxRetries: 3,
                retryDelay: expect.any(Function),
            });
        });

        it('should use exponential backoff for retries', async () => {
            const key = 'test-key';

            retryService.withRetry.mockResolvedValue(key);

            await service.uploadFile(mockFile, key);

            const retryCall = retryService.withRetry.mock.calls[0][0];
            const retryDelay = retryCall.retryDelay!;

            // Test exponential backoff calculation
            expect(retryDelay(1)).toBe(2000); // 1000 * 2^1 = 2000
            expect(retryDelay(2)).toBe(4000); // 1000 * 2^2 = 4000
            expect(retryDelay(3)).toBe(8000); // 1000 * 2^3 = 8000
            expect(retryDelay(4)).toBe(10000); // Capped at 10000
        });
    });

    describe('getFile', () => {
        it('should successfully download file with retry and circuit breaker', async () => {
            const key = 'test-key';
            const expectedContent = Buffer.from('test content');

            retryService.withRetry.mockImplementation(async ({ execute }) => {
                return circuitBreakerService.execute('s3-download', execute);
            });
            circuitBreakerService.execute.mockResolvedValue(expectedContent);

            const result = await service.getFile(key);

            expect(result).toEqual(expectedContent);
            expect(retryService.withRetry).toHaveBeenCalledWith({
                execute: expect.any(Function),
                maxRetries: 3,
                retryDelay: expect.any(Function),
            });
            expect(circuitBreakerService.execute).toHaveBeenCalledWith('s3-download', expect.any(Function));
        });

        it('should handle download failures', async () => {
            const key = 'test-key';
            const error = new Error('S3 download failed');

            retryService.withRetry.mockRejectedValue(error);

            await expect(service.getFile(key)).rejects.toThrow('S3 download failed');
        });
    });

    describe('fetchCloudTrailLogs', () => {
        it('should successfully fetch logs with retry and circuit breaker', async () => {
            const prefix = 'AWSLogs/';
            const expectedLogs = ['log1', 'log2'];

            retryService.withRetry.mockImplementation(async ({ execute }) => {
                return circuitBreakerService.execute('s3-list', execute);
            });
            circuitBreakerService.execute.mockResolvedValue(expectedLogs);

            const result = await service.fetchCloudTrailLogs(prefix);

            expect(result).toEqual(expectedLogs);
            expect(retryService.withRetry).toHaveBeenCalledWith({
                execute: expect.any(Function),
                maxRetries: 3,
                retryDelay: expect.any(Function),
            });
            expect(circuitBreakerService.execute).toHaveBeenCalledWith('s3-list', expect.any(Function));
        });

        it('should handle log fetching failures', async () => {
            const prefix = 'AWSLogs/';
            const error = new Error('S3 list failed');

            retryService.withRetry.mockRejectedValue(error);

            await expect(service.fetchCloudTrailLogs(prefix)).rejects.toThrow('S3 list failed');
        });
    });

    describe('Circuit Breaker Integration', () => {
        it('should use different circuit breakers for different operations', async () => {
            // Test upload
            retryService.withRetry.mockImplementation(async ({ execute }) => {
                return circuitBreakerService.execute('s3-upload', execute);
            });
            circuitBreakerService.execute.mockResolvedValue('test-key');

            await service.uploadFile(mockFile, 'test-key');
            expect(circuitBreakerService.execute).toHaveBeenCalledWith('s3-upload', expect.any(Function));

            jest.clearAllMocks();

            // Test download
            retryService.withRetry.mockImplementation(async ({ execute }) => {
                return circuitBreakerService.execute('s3-download', execute);
            });
            circuitBreakerService.execute.mockResolvedValue(Buffer.from('test'));

            await service.getFile('test-key');
            expect(circuitBreakerService.execute).toHaveBeenCalledWith('s3-download', expect.any(Function));

            jest.clearAllMocks();

            // Test list
            retryService.withRetry.mockImplementation(async ({ execute }) => {
                return circuitBreakerService.execute('s3-list', execute);
            });
            circuitBreakerService.execute.mockResolvedValue(['log1']);

            await service.fetchCloudTrailLogs('test-prefix');
            expect(circuitBreakerService.execute).toHaveBeenCalledWith('s3-list', expect.any(Function));
        });
    });

    describe('Error Scenarios', () => {
        it('should handle configuration errors', async () => {
            // Remove configuration
            (service as any).isConfigured = false;

            await expect(service.uploadFile(mockFile, 'test-key')).rejects.toThrow(
                'AWS S3 is not configured'
            );
        });

        it('should handle S3 client errors gracefully', async () => {
            const s3Error = new Error('S3 service unavailable');
            retryService.withRetry.mockRejectedValue(s3Error);

            await expect(service.uploadFile(mockFile, 'test-key')).rejects.toThrow(
                'S3 service unavailable'
            );
        });
    });
}); 