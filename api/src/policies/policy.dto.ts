import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { PolicyAction } from './policy.entity';

export class CreatePolicyDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  condition: string;

  @IsIn(['BLOCK', 'ALERT'])
  action: PolicyAction;

  @IsBoolean()
  @IsOptional()
  alert?: boolean;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsString()
  @IsOptional()
  model?: string;

  @IsString()
  @IsOptional()
  userId?: string;
}

export class UpdatePolicyDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  name?: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  condition?: string;

  @IsIn(['BLOCK', 'ALERT'])
  @IsOptional()
  action?: PolicyAction;

  @IsBoolean()
  @IsOptional()
  alert?: boolean;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsString()
  @IsOptional()
  model?: string;

  @IsString()
  @IsOptional()
  userId?: string;
}
