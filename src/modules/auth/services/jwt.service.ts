import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../entities/user.entity';
import { Request } from 'express';
import { TokenPayload, TokenResponse } from '@/shared/types/types';

@Injectable()
export class JwtService {
    constructor(
        private readonly jwtService: NestJwtService,
        private readonly configService: ConfigService,
        @InjectRepository(RefreshToken)
        private readonly refreshTokenRepository: Repository<RefreshToken>,
    ) { }

    generateAccessToken(user: User): string {
        const payload: TokenPayload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            type: 'access',
        };

        return this.jwtService.sign(payload, {
            secret: this.configService.get<string>('JWT_SECRET'),
            expiresIn: this.configService.get<string>('JWT_EXPIRATION') || '15m',
        });
    }

    generateRefreshToken(user: User, request?: Request): string {
        const payload: TokenPayload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            type: 'refresh',
        };

        return this.jwtService.sign(payload, {
            secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
            expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d',
        });
    }

    async generateTokenPair(user: User, request?: Request): Promise<TokenResponse> {
        const accessToken = this.generateAccessToken(user);
        const refreshToken = this.generateRefreshToken(user, request);

        // Store refresh token in database
        const refreshTokenEntity = this.refreshTokenRepository.create({
            token: refreshToken,
            userId: user.id,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            userAgent: request?.headers['user-agent'],
            ipAddress: request?.ip || request?.connection?.remoteAddress,
        });

        await this.refreshTokenRepository.save(refreshTokenEntity);

        return {
            accessToken,
            refreshToken,
            expiresIn: 15 * 60, // 15 minutes in seconds
        };
    }

    async validateAccessToken(token: string): Promise<TokenPayload> {
        try {
            const payload = this.jwtService.verify<TokenPayload>(token, {
                secret: this.configService.get<string>('JWT_SECRET'),
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
            const payload = this.jwtService.verify<TokenPayload>(token, {
                secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
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
        const payload = await this.validateRefreshToken(refreshToken);

        // Get user from database
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