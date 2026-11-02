import { Controller, Post, Body, Get, Res, Query, Delete } from '@nestjs/common';
import type { Response } from 'express';
import { ChatService } from './chat.service';
import { ChatDto } from './chat.dto';

@Controller('chat')
export class ChatController {
  constructor(private chat: ChatService) {}

  @Post()
  send(@Body() dto: ChatDto) {
    return this.chat.send(dto.message, dto.sessionId);
  }

  /** Streaming SSE (type ChatGPT) : meta -> chunk* -> done */
  @Post('stream')
  async stream(@Body() dto: ChatDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    try {
      for await (const sse of this.chat.stream(dto.message, dto.sessionId)) {
        res.write(sse);
      }
    } finally {
      res.end();
    }
  }

  @Get('history')
  history(@Query('sessionId') sessionId?: string) {
    return this.chat.history(50, sessionId);
  }

  /** Efface l'historique d'une session (confidentialite : bouton "Tout effacer"). */
  @Delete('history')
  clear(@Query('sessionId') sessionId?: string) {
    return this.chat.clear(sessionId);
  }

  @Get('status')
  status() {
    return this.chat.status();
  }
}
