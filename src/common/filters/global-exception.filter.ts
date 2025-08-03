import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError, EntityNotFoundError, CannotCreateEntityIdMapError } from 'typeorm';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(GlobalExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const { status, message, error } = this.getErrorResponse(exception);

        const errorResponse = {
            statusCode: status,
            timestamp: new Date().toISOString(),
            path: request.url,
            method: request.method,
            message,
            error,
            ...(process.env.NODE_ENV === 'development' && {
                stack: exception instanceof Error ? exception.stack : undefined,
            }),
        };

        // Log the error
        this.logError(exception, request, errorResponse);

        response.status(status).json(errorResponse);
    }

    private getErrorResponse(exception: unknown): {
        status: number;
        message: string | string[];
        error: string;
    } {
        if (exception instanceof HttpException) {
            const response = exception.getResponse();
            return {
                status: exception.getStatus(),
                message: typeof response === 'object' && 'message' in response
                    ? (response as any).message
                    : exception.message,
                error: exception.name,
            };
        }

        // Database errors
        if (exception instanceof QueryFailedError) {
            return {
                status: HttpStatus.BAD_REQUEST,
                message: 'Database query failed',
                error: 'QueryFailedError',
            };
        }

        if (exception instanceof EntityNotFoundError) {
            return {
                status: HttpStatus.NOT_FOUND,
                message: 'Resource not found',
                error: 'EntityNotFoundError',
            };
        }

        if (exception instanceof CannotCreateEntityIdMapError) {
            return {
                status: HttpStatus.BAD_REQUEST,
                message: 'Entity creation failed',
                error: 'CannotCreateEntityIdMapError',
            };
        }

        // Circuit breaker errors
        if (exception instanceof Error && exception.message.includes('Circuit breaker')) {
            return {
                status: HttpStatus.SERVICE_UNAVAILABLE,
                message: 'Service temporarily unavailable',
                error: 'CircuitBreakerOpen',
            };
        }

        // OpenAI API errors
        if (exception instanceof Error && exception.message.includes('OpenAI')) {
            return {
                status: HttpStatus.BAD_GATEWAY,
                message: 'AI service temporarily unavailable',
                error: 'AIServiceError',
            };
        }

        // AWS errors
        if (exception instanceof Error && 
            (exception.message.includes('AWS') 
            || exception.message.includes('Google') 
            || exception.message.includes('Github')
        )) {
            return {
                status: HttpStatus.BAD_GATEWAY,
                message: 'Cloud service integration error',
                error: 'CloudServiceError',
            };
        }

        // Rate limit errors
        if (exception instanceof Error && exception.message.includes('Rate limit')) {
            return {
                status: HttpStatus.TOO_MANY_REQUESTS,
                message: 'Too many requests',
                error: 'RateLimitExceeded',
            };
        }


        // Default error
        return {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            message: exception instanceof Error ? exception.message : 'Internal server error',
            error: 'InternalServerError',
        };
    }

    private logError(
        exception: unknown,
        request: Request,
        errorResponse: any,
    ): void {
        const { statusCode, message } = errorResponse;
        const { method, url } = request;
        const user = (request as any).user;

        const errorMessage = `${method} ${url} - ${statusCode} - ${message}`;

        if (statusCode >= 500) {
            this.logger.error(
                errorMessage,
                exception instanceof Error ? exception.stack : exception,
                `User: ${user ? (user as any).id : 'anonymous'}`,
            );
        } else if (statusCode >= 400) {
            this.logger.warn(
                errorMessage,
                `User: ${user ? (user as any).id : 'anonymous'}`,
            );
        }
    }
} 