import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as path from 'path';
import { ChatModule } from './chat/chat.module';
import { ResourcesModule } from './resources/resources.module';

// En production, sert le build statique du frontend (SPA) depuis le backend :
// un seul service, un seul domaine => pas de CORS ni de proxy à configurer.
const frontendDist = process.env.FRONT_DIST || path.join(__dirname, '..', '..', 'frontend', 'dist');

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: frontendDist,
      exclude: ['/api', '/api/(.*)'],
    }),
    ChatModule,
    ResourcesModule,
  ],
})
export class AppModule {}
