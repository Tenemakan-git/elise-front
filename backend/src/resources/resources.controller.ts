import { Controller, Get, Param } from '@nestjs/common';
import { ResourcesService } from './resources.service';

@Controller('resources')
export class ResourcesController {
  constructor(private resources: ResourcesService) {}

  /** Liste des ressources (titre, categorie, intro) pour l'affichage en liste. */
  @Get()
  list() {
    return this.resources.list();
  }

  /** Un article complet : corps HTML documente + source. */
  @Get(':id')
  article(@Param('id') id: string) {
    return this.resources.article(id);
  }
}
