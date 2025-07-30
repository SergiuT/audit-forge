// src/modules/auth/strategies/jwt.strategy.ts
import { Strategy, ExtractJwt } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth.service';

const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret'; // Use your environment variables for production

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly userService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: JWT_SECRET,
    });
  }

  async validate(payload: any) {
    const user = await this.userService.findUserById(payload.id);

    if (!user) throw new Error('Invalid token');

    return { id: user.id, email: user.email, role: user.role }; // You can return more user info if needed
  }
}
