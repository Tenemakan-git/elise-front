import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ClaudeService } from './claude.service';

@Module({
  controllers: [ChatController],
  providers: [ChatService, ClaudeService],
})
export class ChatModule {}
