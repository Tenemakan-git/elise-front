import { Controller, Post, Body, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ChatService } from './chat.service';
import { ChatDto } from './chat.dto';

@Controller('chat')
export class ChatController {
  constructor(private chat: ChatService) {}

  @Post()
  send(@Body() dto: ChatDto) {
    return this.chat.send(dto.message);
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
      for await (const sse of this.chat.stream(dto.message)) {
        res.write(sse);
      }
    } finally {
      res.end();
    }
  }

  @Get('history')
  history() {
    return this.chat.history();
  }

  @Get('status')
  status() {
    return this.chat.status();
  }
}
