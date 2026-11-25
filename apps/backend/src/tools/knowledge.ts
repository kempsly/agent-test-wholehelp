// Placeholder knowledge base. On test day, replace these entries with data for the given topic
// (or load a JSON file). Keep fields: id, title, tags, content.

export interface KnowledgeEntry {
  id: string;
  title: string;
  tags: string[];
  content: string;
}

export const knowledgeBase: KnowledgeEntry[] = [
  {
    id: "kb-001",
    title: "Délai de paiement des factures fournisseurs",
    tags: ["facture", "fournisseur", "paiement", "délai"],
    content:
      "En France, le délai de paiement entre entreprises ne peut pas dépasser 60 jours à compter de la date d'émission de la facture, ou 45 jours fin de mois si le contrat le prévoit.",
  },
  {
    id: "kb-002",
    title: "Relance d'une facture client impayée",
    tags: ["relance", "impayé", "client", "facture"],
    content:
      "Procédure : relance amiable par e-mail à J+7 après l'échéance, relance téléphonique à J+15, mise en demeure à J+30. Des pénalités de retard et une indemnité forfaitaire de 40 € peuvent être appliquées.",
  },
  {
    id: "kb-003",
    title: "Taux de TVA en France",
    tags: ["tva", "taux", "taxe"],
    content:
      "Taux normal 20 %, taux intermédiaire 10 % (restauration, travaux), taux réduit 5,5 % (alimentation, énergie), taux particulier 2,1 % (médicaments remboursables, presse).",
  },
];
