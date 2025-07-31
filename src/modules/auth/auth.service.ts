// src/modules/auth/auth.service.ts
import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { JwtService } from './services/jwt.service';
import * as bcrypt from 'bcrypt';
import { Request } from 'express';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) { }

  async register(username: string, email: string, password: string, request?: Request) {
    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: [{ email }, { username }],
    });

    if (existingUser) {
      throw new ConflictException('User with this email or username already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = this.userRepository.create({
      username,
      email,
      password: hashedPassword,
    });

    await this.userRepository.save(user);

    // Generate token pair
    return this.jwtService.generateTokenPair(user, request);
  }

  async login(email: string, password: string, request?: Request) {
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate token pair
    return this.jwtService.generateTokenPair(user, request);
  }

  async refreshToken(refreshToken: string, request?: Request) {
    try {
      return await this.jwtService.refreshAccessToken(refreshToken);
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(refreshToken: string, userId: number) {
    await this.jwtService.revokeRefreshToken(refreshToken, userId);
    return { message: 'Successfully logged out' };
  }

  async logoutAll(userId: number) {
    await this.jwtService.revokeAllUserTokens(userId, userId);
    return { message: 'Successfully logged out from all devices' };
  }

  async findUserById(id: number) {
    return this.userRepository.findOne({ where: { id } });
  }

  async findUserByEmail(email: string) {
    return this.userRepository.findOne({ where: { email } });
  }

  async getUserSessions(userId: number) {
    return this.userRepository.findOne({
      where: { id: userId },
      relations: ['refreshTokens'],
    });
  }
}
