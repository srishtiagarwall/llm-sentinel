import {
  Controller,
  Post,
  Body,
  Headers,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProxyService } from './proxy.service';
import type { ChatCompletionRequest } from './proxy.dto';

@Controller('v1')
@UseGuards(AuthGuard('jwt'))
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  /**
   * Drop-in OpenAI-compatible endpoint.
   * Point your existing SDK at this gateway instead of api.openai.com — zero other changes needed.
   *
   * Provider is resolved from X-Provider header (openai | gemini | claude).
   * Defaults to openai if not set.
   */
  @Post('chat/completions')
  @HttpCode(HttpStatus.OK)
  async chatCompletions(
    @Body() body: ChatCompletionRequest,
    @Request() req: any,
    @Headers('x-provider') provider = 'openai',
    @Headers('x-session-id') sessionId?: string,
  ) {
    return this.proxyService.handleChatCompletion(body, {
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      sessionId,
      provider,
    });
  }
}
