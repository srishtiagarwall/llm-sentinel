import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { IsString } from 'class-validator';

class TokenDto {
  @IsString() userId: string;
  @IsString() tenantId: string;
  @IsString() role: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // dev-only endpoint — in production, tokens are issued by your identity provider
  @Post('token')
  generateToken(@Body() dto: TokenDto) {
    const token = this.authService.generateToken(dto.userId, dto.tenantId, dto.role);
    return { token };
  }
}
