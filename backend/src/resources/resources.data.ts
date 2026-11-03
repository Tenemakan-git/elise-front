/**
 * resources.data.ts — Catalogue des ressources documentees.
 *
 * Chaque ressource est un ARTICLE lisible, construit a partir d'une fiche du
 * corpus verifie (backend/rag/corpus). On ne renvoie plus un simple theme a
 * poser dans le chat : la personne peut lire un contenu documente et source.
 */

export interface ResourceDef {
  id: string;
  /** Titre affiche (plus parlant que celui de la fiche). */
  title: string;
  /** Categorie de regroupement dans la liste. */
  category: string;
  /** Icone (cle connue du frontend). */
  icon: string;
  /** Resume court affiche sous le titre dans la liste. */
  intro: string;
  /** Fichier du corpus (sans chemin) qui porte le contenu. */
  file: string;
  /** Question proposee pour prolonger dans le chat (action secondaire). */
  ask: string;
}

export const RESOURCES: ResourceDef[] = [
  {
    id: 'cycle',
    title: 'Le cycle menstruel et la période fertile',
    category: 'Mon corps',
    icon: 'droplet',
    intro: 'Comment fonctionne ton cycle, quand tu es fertile, et ce qui est normal.',
    file: 'fecondite-cycle-fertilite.md',
    ask: 'Explique-moi ma période fertile',
  },
  {
    id: 'hygiene',
    title: 'Les règles : hygiène au quotidien',
    category: 'Mon corps',
    icon: 'droplet',
    intro: 'Protections, hygiène, gestion des règles à l’école et des douleurs.',
    file: 'hygiene-menstruelle.md',
    ask: 'Comment bien gérer mon hygiène pendant mes règles ?',
  },
  {
    id: 'contraception',
    title: 'Les moyens de contraception',
    category: 'Contraception',
    icon: 'pill',
    intro: 'Les méthodes existantes et quoi faire après un rapport non protégé.',
    file: 'contraception-moyens.md',
    ask: 'Quels sont les moyens de contraception ?',
  },
  {
    id: 'ist',
    title: 'Les IST : signes, prévention, dépistage',
    category: 'IST & dépistage',
    icon: 'shield',
    intro: 'Reconnaître, se protéger, et savoir quand se faire dépister.',
    file: 'ist-signes-depistage.md',
    ask: 'Comment savoir si j’ai une IST ?',
  },
  {
    id: 'depistage',
    title: 'Où se faire dépister à Abidjan',
    category: 'IST & dépistage',
    icon: 'mappin',
    intro: 'Les lieux de dépistage, souvent gratuits et confidentiels.',
    file: 'ci-depistage-ist-abidjan.md',
    ask: 'Où puis-je me faire dépister à Abidjan ?',
  },
  {
    id: 'grossesse',
    title: 'Grossesse et suivi prénatal',
    category: 'Grossesse',
    icon: 'heart',
    intro: 'Premiers signes, test, et l’importance des consultations.',
    file: 'oms-soins-prenatals.md',
    ask: 'Que faire si je pense être enceinte ?',
  },
  {
    id: 'violences',
    title: 'Violences : que faire, qui appeler',
    category: 'Aide & urgences',
    icon: 'users',
    intro: 'Tes droits, les démarches, et les numéros gratuits et confidentiels.',
    file: 'ci-vbg-1308.md',
    ask: 'J’ai besoin d’aide, que faire ?',
  },
];
