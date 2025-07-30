import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from './entities/user.entity';  // Import the User entity
import { JwtStrategy } from './strategies/jwt.strategy'; // Import the JWT strategy
import { PassportModule } from '@nestjs/passport'; // Passport module for JWT strategy

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),  // Add the User entity here so it can be injected
    PassportModule.register({ defaultStrategy: 'jwt' }),  // Register Passport with JWT
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService]
})
export class AuthModule {}
