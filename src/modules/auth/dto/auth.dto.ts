import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { SanitizeEmail, SanitizeString } from '@/common/decorators/sanitize.decorator';

export class LoginDto {
  @IsEmail()
  @SanitizeEmail()
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(48)
  @SanitizeString()
  password: string;
}

export class RegisterDto {
  @IsString()
  @MinLength(3)
  @SanitizeString()
  username: string;

  @IsEmail()
  // @SanitizeEmail()
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(48)
  // @SanitizeString()
  password: string;
}

export class RefreshTokenDto {
  @IsString()
  @SanitizeString()
  refreshToken: string;
}