import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ClaudeService } from './claude.service';
import { SafetyService } from './safety.service';

@Module({
  controllers: [ChatController],
  providers: [ChatService, ClaudeService, SafetyService],
})
export class ChatModule {}
