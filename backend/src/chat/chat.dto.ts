import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export interface ClientTurn {
  role: 'user' | 'assistant';
  content: string;
}

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  /**
   * Historique de la conversation fourni par le client (le serveur ne conserve
   * rien). Permet de reprendre une conversation rouverte depuis l'historique
   * local avec le contexte. Chaque element : { role, content }. Validé/borné
   * côté service.
   */
  @IsOptional()
  @IsArray()
  history?: ClientTurn[];
}
