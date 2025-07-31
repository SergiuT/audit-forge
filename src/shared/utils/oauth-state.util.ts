import { BadRequestException } from '@nestjs/common';

export interface OAuthState {
    userId: string;
    projectId: string;
    nonce?: string;
}

// Security constants
const MAX_STATE_SIZE = 1024; // 1KB limit
const MAX_USER_ID_LENGTH = 50;
const MAX_PROJECT_ID_LENGTH = 50;
const MAX_NONCE_LENGTH = 32;

/**
 * Sanitizes and validates input strings or numbers
 * @param input - Input to sanitize (string or number)
 * @param maxLength - Maximum allowed length
 * @param fieldName - Field name for error messages
 * @returns Sanitized string
 * @throws BadRequestException if input is invalid
 */
function sanitizeInput(input: string | number, maxLength: number, fieldName: string): string {
    if (!input) {
        throw new BadRequestException(`${fieldName} is required`);
    }

    // Convert to string and trim whitespace
    const stringInput = String(input).trim();

    if (stringInput.length === 0) {
        throw new BadRequestException(`${fieldName} cannot be empty`);
    }

    if (stringInput.length > maxLength) {
        throw new BadRequestException(`${fieldName} exceeds maximum length of ${maxLength} characters`);
    }

    // Check for potentially dangerous characters (basic XSS prevention)
    const dangerousPattern = /[<>\"'&]/;
    if (dangerousPattern.test(stringInput)) {
        throw new BadRequestException(`${fieldName} contains invalid characters`);
    }

    return stringInput;
}

/**
 * Validates and parses OAuth state parameter
 * @param state - The encoded state parameter from OAuth callback
 * @returns Parsed state object with userId and projectId
 * @throws BadRequestException if state is invalid
 */
export function validateOAuthState(state: string): OAuthState {
    if (!state) {
        throw new BadRequestException('No state parameter received');
    }

    // Check state size to prevent DoS attacks
    if (state.length > MAX_STATE_SIZE) {
        throw new BadRequestException('State parameter exceeds maximum size');
    }

    try {
        // Decode the state parameter
        const decodedState = decodeURIComponent(state);

        // Parse the JSON state
        const parsedState = JSON.parse(decodedState) as OAuthState;

        // Validate and sanitize required fields
        const userId = sanitizeInput(parsedState.userId, MAX_USER_ID_LENGTH, 'userId');
        const projectId = sanitizeInput(parsedState.projectId, MAX_PROJECT_ID_LENGTH, 'projectId');

        // Optional: Validate nonce if present
        let nonce: string | undefined;
        if (parsedState.nonce) {
            if (typeof parsedState.nonce !== 'string') {
                throw new BadRequestException('State parameter has invalid nonce type');
            }
            nonce = sanitizeInput(parsedState.nonce, MAX_NONCE_LENGTH, 'nonce');
        }

        return {
            userId,
            projectId,
            nonce,
        };
    } catch (error) {
        if (error instanceof BadRequestException) {
            throw error;
        }

        // Handle JSON parsing errors
        if (error instanceof SyntaxError) {
            throw new BadRequestException('Invalid state parameter format');
        }

        // Handle URI decoding errors
        if (error instanceof URIError) {
            throw new BadRequestException('Invalid state parameter encoding');
        }

        // Handle validation errors
        throw new BadRequestException(`Invalid state parameter: ${error.message}`);
    }
}

/**
 * Creates a secure OAuth state object
 * @param userId - User ID
 * @param projectId - Project ID
 * @param includeNonce - Whether to include a security nonce (default: true)
 * @returns Encoded state string for OAuth URL
 */
export function createOAuthState(
    userId: string | number,
    projectId: string | number,
    includeNonce: boolean = true
): string {
    // Sanitize inputs
    const sanitizedUserId = sanitizeInput(userId, MAX_USER_ID_LENGTH, 'userId');
    const sanitizedProjectId = sanitizeInput(projectId, MAX_PROJECT_ID_LENGTH, 'projectId');

    const stateData: OAuthState = {
        userId: sanitizedUserId,
        projectId: sanitizedProjectId,
    };

    // Add security nonce if requested
    if (includeNonce) {
        const { randomBytes } = require('crypto');
        stateData.nonce = randomBytes(16).toString('hex');
    }

    const stateString = JSON.stringify(stateData);

    // Check final size before encoding
    if (stateString.length > MAX_STATE_SIZE) {
        throw new Error('Generated state parameter exceeds maximum size');
    }

    return encodeURIComponent(stateString);
}

/**
 * Validates that the state nonce matches (for additional security)
 * @param state - The parsed state object
 * @param expectedNonce - The expected nonce value
 * @throws BadRequestException if nonce doesn't match
 */
export function validateStateNonce(state: OAuthState, expectedNonce: string): void {
    if (!state.nonce) {
        throw new BadRequestException('State parameter missing security nonce');
    }

    if (typeof expectedNonce !== 'string' || expectedNonce.length === 0) {
        throw new BadRequestException('Expected nonce is invalid');
    }

    // Use constant-time comparison to prevent timing attacks
    if (!constantTimeCompare(state.nonce, expectedNonce)) {
        throw new BadRequestException('Invalid state parameter: nonce mismatch');
    }
}

/**
 * Constant-time string comparison to prevent timing attacks
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal
 */
function constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
        return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
} 