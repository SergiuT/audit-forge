import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../entities/user.entity';
import { Request } from 'express';
import { TokenPayload, TokenResponse } from '@/shared/types/types';
import { AWSSecretManagerService } from '@/shared/services/aws-secret.service';

@Injectable()
export class JwtService {
    constructor(
        private readonly jwtService: NestJwtService,
        private readonly configService: ConfigService,
        private readonly awsSecretManagerService: AWSSecretManagerService,
        
        @InjectRepository(RefreshToken)
        private readonly refreshTokenRepository: Repository<RefreshToken>,
    ) { }

    async generateAccessToken(user: User): Promise<string> {
        const payload: TokenPayload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            type: 'access',
        };

        const secret = await this.awsSecretManagerService.getSecretWithFallback('jwt-secret', 'JWT_SECRET');

        return this.jwtService.sign(payload, {
            secret,
            expiresIn: this.configService.get<string>('JWT_EXPIRATION') || '15m',
        });
    }

    async generateRefreshToken(user: User, request?: Request): Promise<string> {
        const payload: TokenPayload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            type: 'refresh',
        };

        const secret = await this.awsSecretManagerService.getSecretWithFallback('jwt-refresh-secret', 'JWT_REFRESH_SECRET');

        return this.jwtService.sign(payload, {
            secret,
            expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d',
        });
    }

    async generateTokenPair(user: User, request?: Request): Promise<TokenResponse> {
        const accessToken = await this.generateAccessToken(user);
        const refreshToken = await this.generateRefreshToken(user, request);

        // Store refresh token in database
        const refreshTokenEntity = this.refreshTokenRepository.create({
            token: refreshToken,
            userId: user.id,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            userAgent: request?.headers['user-agent'],
            ipAddress: request?.ip || request?.connection?.remoteAddress,
        });

        await this.refreshTokenRepository.save(refreshTokenEntity);

        return {
            accessToken,
            refreshToken,
            expiresIn: 15 * 60,
        };
    }

    async validateAccessToken(token: string): Promise<TokenPayload> {
        try {
            const secret = await this.awsSecretManagerService.getSecretWithFallback('jwt-secret', 'JWT_SECRET');
            const payload = this.jwtService.verify<TokenPayload>(token, {
                secret,
            });

            if (payload.type !== 'access') {
                throw new UnauthorizedException('Invalid token type');
            }

            return payload;
        } catch (error) {
            throw new UnauthorizedException('Invalid access token');
        }
    }

    async validateRefreshToken(token: string): Promise<TokenPayload> {
        try {
            const secret = await this.awsSecretManagerService.getSecretWithFallback('jwt-refresh-secret', 'JWT_REFRESH_SECRET');
            const payload = this.jwtService.verify<TokenPayload>(token, {
                secret,
            });

            if (payload.type !== 'refresh') {
                throw new UnauthorizedException('Invalid token type');
            }

            // Check if refresh token exists and is not revoked
            const refreshTokenEntity = await this.refreshTokenRepository.findOne({
                where: { token, isRevoked: false },
                relations: ['user'],
            });

            if (!refreshTokenEntity || refreshTokenEntity.expiresAt < new Date()) {
                throw new UnauthorizedException('Refresh token is invalid or expired');
            }

            return payload;
        } catch (error) {
            throw new UnauthorizedException('Invalid refresh token');
        }
    }

    async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
        const user = await this.refreshTokenRepository.findOne({
            where: { token: refreshToken },
            relations: ['user'],
        });

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        // Generate new token pair
        return this.generateTokenPair(user.user);
    }

    async revokeRefreshToken(token: string, revokedBy: number): Promise<void> {
        const refreshToken = await this.refreshTokenRepository.findOne({
            where: { token },
        });

        if (refreshToken) {
            refreshToken.isRevoked = true;
            refreshToken.revokedAt = new Date();
            refreshToken.revokedBy = revokedBy;
            await this.refreshTokenRepository.save(refreshToken);
        }
    }

    async revokeAllUserTokens(userId: number, revokedBy?: number): Promise<void> {
        await this.refreshTokenRepository.update(
            { userId, isRevoked: false },
            { isRevoked: true, revokedAt: new Date(), revokedBy }
        );
    }

    async cleanupExpiredTokens(): Promise<void> {
        await this.refreshTokenRepository.delete({
            expiresAt: new Date(),
        });
    }
} 