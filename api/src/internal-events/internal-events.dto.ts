import { IsString, MinLength } from 'class-validator';

export class TraceEventDto {
  @IsString()
  @MinLength(1)
  traceId: string;
}
