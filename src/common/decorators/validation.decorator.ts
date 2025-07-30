import { applyDecorators } from '@nestjs/common';
import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsArray,
    ValidateNested,
    IsUUID,
    IsEmail,
    IsInt,
    Min,
    Max,
    Matches,
    Length,
    IsBoolean
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// Common validation patterns
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const AWS_ARN_REGEX = /^arn:aws:[a-zA-Z0-9][a-zA-Z0-9\-]*:[a-zA-Z0-9\-]*:\d*:[a-zA-Z0-9\-_\/\.]*$/;
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Custom validation decorators
export function IsRequiredString(options?: { minLength?: number; maxLength?: number; pattern?: RegExp }) {
    const decorators = [
        IsString(),
        IsNotEmpty(),
        Transform(({ value }) => value?.trim()),
    ];

    if (options?.minLength || options?.maxLength) {
        decorators.push(Length(options.minLength || 1, options.maxLength || 255));
    }

    if (options?.pattern) {
        decorators.push(Matches(options.pattern));
    }

    return applyDecorators(...decorators);
}

export function IsOptionalString(options?: { minLength?: number; maxLength?: number; pattern?: RegExp }) {
    const decorators = [
        IsOptional(),
        IsString(),
        Transform(({ value }) => value?.trim() || undefined),
    ];

    if (options?.minLength || options?.maxLength) {
        decorators.push(Length(options.minLength || 0, options.maxLength || 255));
    }

    if (options?.pattern) {
        decorators.push(Matches(options.pattern));
    }

    return applyDecorators(...decorators);
}

export function IsValidEmail() {
    return applyDecorators(
        IsEmail(),
        IsNotEmpty(),
        Transform(({ value }) => value?.toLowerCase().trim()),
        ApiProperty({
            example: 'user@example.com',
            description: 'Valid email address'
        })
    );
}

export function IsValidUUID() {
    return applyDecorators(
        IsUUID(4),
        IsNotEmpty(),
        ApiProperty({
            example: '123e4567-e89b-12d3-a456-426614174000',
            description: 'Valid UUID v4'
        })
    );
}

export function IsAwsArn() {
    return applyDecorators(
        IsString(),
        IsNotEmpty(),
        Matches(AWS_ARN_REGEX, {
            message: 'Must be a valid AWS ARN format'
        }),
        ApiProperty({
            example: 'arn:aws:iam::123456789012:role/ComplianceRole',
            description: 'Valid AWS ARN'
        })
    );
}

export function IsValidProjectId() {
    return applyDecorators(
        IsInt(),
        Min(1),
        Type(() => Number),
        ApiProperty({
            example: 1,
            description: 'Valid project ID'
        })
    );
}

export function IsValidPagination() {
    return applyDecorators(
        IsOptional(),
        IsInt(),
        Min(1),
        Max(100),
        Type(() => Number),
        ApiProperty({
            required: false,
            minimum: 1,
            maximum: 100,
            default: 20
        })
    );
}

export function IsArrayOfStrings() {
    return applyDecorators(
        IsArray(),
        IsString({ each: true }),
        Transform(({ value }) =>
            Array.isArray(value)
                ? value.map(v => typeof v === 'string' ? v.trim() : v).filter(v => v.length > 0)
                : []
        )
    );
}

export function IsOptionalArrayOfStrings() {
    return applyDecorators(
        IsOptional(),
        IsArray(),
        IsString({ each: true }),
        Transform(({ value }) =>
            Array.isArray(value)
                ? value.map(v => typeof v === 'string' ? v.trim() : v).filter(v => v.length > 0)
                : undefined
        )
    );
}

export function IsValidSeverity() {
    return applyDecorators(
        IsOptional(),
        IsEnum(['low', 'medium', 'high'], { each: true }),
        IsArray(),
        ApiProperty({
            required: false,
            enum: ['low', 'medium', 'high'],
            isArray: true,
            description: 'Filter by finding severity levels'
        })
    );
}

export function IsValidIntegrationType() {
    return applyDecorators(
        IsEnum(['aws', 'gcp', 'github', 'cloudflare', 'other']),
        ApiProperty({
            enum: ['aws', 'gcp', 'github', 'cloudflare', 'other'],
            description: 'Type of integration'
        })
    );
}

export function IsPositiveInteger() {
    return applyDecorators(
        IsInt(),
        Min(1),
        Type(() => Number)
    );
}

export function IsOptionalBoolean() {
    return applyDecorators(
        IsOptional(),
        IsBoolean(),
        Transform(({ value }) => {
            if (value === 'true') return true;
            if (value === 'false') return false;
            return value;
        })
    );
} 