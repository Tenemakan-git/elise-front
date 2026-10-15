import { Controller, Get } from '@nestjs/common';

const ITEMS = [
  { id: 'cycle', title: 'Cycle menstruel', desc: 'Duree, ovulation, periode fertile.', question: 'Explique mon cycle et ma periode fertile' },
  { id: 'contra', title: 'Contraception', desc: 'Pilule, implant, DIU, preservatifs.', question: 'Quels moyens de contraception ?' },
  { id: 'ist', title: 'IST & depistage', desc: 'Signes, prevention, ou se tester.', question: 'Signes IST et ou me faire depister ?' },
  { id: 'mental', title: 'Sante mentale', desc: 'Stress, tristesse, quand aider.', question: 'Je me sens triste et seule' },
  { id: 'grossesse', title: 'Grossesse & retard', desc: 'Test, que faire en cas de doute.', question: "Retard de regles, que faire ?" },
  { id: 'violence', title: 'Violences & consentement', desc: 'Aide, numeros utiles.', question: "On m'a forcee, que faire ?" },
];

@Controller('resources')
export class ResourcesController {
  @Get()
  list() {
    return ITEMS;
  }
}
