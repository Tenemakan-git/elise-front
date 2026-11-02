import { Injectable, Logger } from '@nestjs/common';
import { RiskLevel } from './message.entity';
import {
  RED_TERMS,
  ORANGE_TERMS,
  YELLOW_TERMS,
  BYPASS_TERMS,
  normalize,
  maxLevel,
  pickEmergency,
  violatesOutputRules,
  SAFE_REPLACEMENT_HTML,
} from './safety.data';

export interface SafetyVerdict {
  /** Niveau issu de la liste d'alerte seule (plancher). */
  listLevel: RiskLevel;
  /** Vrai si une tentative de contournement est detectee. */
  bypass: boolean;
}

/**
 * SafetyService — classification par liste d'alerte et filtre de sortie.
 *
 * Principe (recommandation du mentor) :
 *   niveau_final = max( liste_alerte(message) , classification_llm(historique) )
 * La liste garantit qu'aucun cas evident n'echappe ; le LLM rattrape les
 * formulations indirectes. En cas de doute, on retient le niveau superieur.
 */
@Injectable()
export class SafetyService {
  private readonly logger = new Logger('SafetyEngine');

  /** Classement par liste d'alerte (sans accent). Sert de plancher. */
  classifyByList(message: string): SafetyVerdict {
    const t = normalize(message);
    let listLevel: RiskLevel = 'green';
    if (RED_TERMS.some((k) => t.includes(k))) listLevel = 'red';
    else if (ORANGE_TERMS.some((k) => t.includes(k))) listLevel = 'orange';
    else if (YELLOW_TERMS.some((k) => t.includes(k))) listLevel = 'yellow';

    const bypass = BYPASS_TERMS.some((k) => t.includes(k));
    if (bypass) {
      // Journalise sans stocker le contenu : seulement le fait + un extrait court.
      this.logger.warn(`Tentative de contournement detectee (len=${message.length}).`);
    }
    return { listLevel, bypass };
  }

  /**
   * Combine la liste d'alerte et la classification du modele.
   * Regle "en cas de doute, niveau superieur" => on prend le max.
   */
  combine(listLevel: RiskLevel, llmLevel: RiskLevel | null): RiskLevel {
    if (!llmLevel) return listLevel;
    return maxLevel(listLevel, llmLevel);
  }

  /** Message d'urgence preecrit adapte au texte (niveau rouge). */
  emergencyHtml(message: string): string {
    return pickEmergency(normalize(message));
  }

  /**
   * Filtre de sortie. Si la reponse generee nomme une maladie ou un medicament,
   * on la remplace par une formulation sure. Retourne la reponse eventuellement
   * corrigee et un drapeau indiquant si une correction a eu lieu.
   */
  filterOutput(html: string): { html: string; blocked: boolean } {
    if (violatesOutputRules(html)) {
      this.logger.warn('Reponse generee bloquee par le filtre de sortie (diagnostic/medicament).');
      return { html: SAFE_REPLACEMENT_HTML, blocked: true };
    }
    return { html, blocked: false };
  }

  /** Reponse standard a une tentative de contournement (refus poli). */
  bypassReplyHtml(): string {
    return (
      `Je comprends la demande, mais je ne peux pas jouer un autre role ni poser de diagnostic. ` +
      `Je suis la pour t'informer et t'orienter en securite.<br><br>` +
      `Dis-moi ce qui t'inquiete, et si c'est necessaire je t'aiderai a <b>preparer une consultation</b> ` +
      `avec un professionnel de sante a Abidjan.`
    );
  }
}
