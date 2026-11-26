/** Libellés NAF rév. 2 par division (2 premiers chiffres du code APE). */
const DIVISIONS: Record<string, string> = {
  "01": "Agriculture et élevage", "02": "Sylviculture", "03": "Pêche et aquaculture",
  "05": "Extraction de charbon", "06": "Extraction d'hydrocarbures", "07": "Extraction de minerais métalliques", "08": "Autres industries extractives", "09": "Services de soutien aux industries extractives",
  "10": "Industries alimentaires", "11": "Fabrication de boissons", "12": "Industrie du tabac", "13": "Industrie textile", "14": "Industrie de l'habillement", "15": "Industrie du cuir et de la chaussure",
  "16": "Travail du bois", "17": "Industrie du papier et du carton", "18": "Imprimerie", "19": "Cokéfaction et raffinage", "20": "Industrie chimique", "21": "Industrie pharmaceutique",
  "22": "Industrie du caoutchouc et du plastique", "23": "Fabrication de produits minéraux non métalliques", "24": "Métallurgie", "25": "Fabrication de produits métalliques", "26": "Fabrication de produits informatiques et électroniques",
  "27": "Fabrication d'équipements électriques", "28": "Fabrication de machines et équipements industriels", "29": "Industrie automobile", "30": "Fabrication d'autres matériels de transport", "31": "Fabrication de meubles", "32": "Autres industries manufacturières",
  "33": "Réparation et installation de machines et équipements industriels",
  "35": "Production et distribution d'énergie", "36": "Captage et distribution d'eau", "37": "Collecte et traitement des eaux usées", "38": "Collecte et traitement des déchets", "39": "Dépollution",
  "41": "Construction de bâtiments", "42": "Génie civil", "43": "Travaux de construction spécialisés",
  "45": "Commerce et réparation d'automobiles", "46": "Commerce de gros", "47": "Commerce de détail",
  "49": "Transports terrestres", "50": "Transports par eau", "51": "Transports aériens", "52": "Entreposage et services auxiliaires de transport (logistique)", "53": "Activités de poste et de courrier",
  "55": "Hébergement", "56": "Restauration",
  "58": "Édition", "59": "Production audiovisuelle", "60": "Programmation et diffusion", "61": "Télécommunications", "62": "Programmation, conseil et services informatiques (logiciels)", "63": "Services d'information",
  "64": "Services financiers", "65": "Assurance", "66": "Activités auxiliaires de services financiers",
  "68": "Activités immobilières",
  "69": "Activités juridiques et comptables", "70": "Conseil de gestion et activités des sièges sociaux", "71": "Architecture et ingénierie", "72": "Recherche-développement scientifique", "73": "Publicité et études de marché", "74": "Autres activités spécialisées, scientifiques et techniques", "75": "Activités vétérinaires",
  "77": "Location et location-bail", "78": "Activités liées à l'emploi", "79": "Agences de voyage", "80": "Enquêtes et sécurité", "81": "Services relatifs aux bâtiments et aménagement paysager", "82": "Services administratifs et de soutien aux entreprises",
  "84": "Administration publique", "85": "Enseignement", "86": "Activités pour la santé humaine", "87": "Hébergement médico-social", "88": "Action sociale sans hébergement",
  "90": "Activités créatives et artistiques", "91": "Bibliothèques, musées", "92": "Jeux de hasard", "93": "Activités sportives et de loisirs",
  "94": "Organisations associatives", "95": "Réparation d'ordinateurs et de biens personnels", "96": "Autres services personnels", "97": "Activités des ménages employeurs", "99": "Activités extra-territoriales",
};

export function nafLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return DIVISIONS[code.slice(0, 2)] ?? null;
}

export const REGIONS: Record<string, string> = {
  "01": "Guadeloupe", "02": "Martinique", "03": "Guyane", "04": "La Réunion", "06": "Mayotte",
  "11": "Île-de-France", "24": "Centre-Val de Loire", "27": "Bourgogne-Franche-Comté", "28": "Normandie",
  "32": "Hauts-de-France", "44": "Grand Est", "52": "Pays de la Loire", "53": "Bretagne", "75": "Nouvelle-Aquitaine",
  "76": "Occitanie", "84": "Auvergne-Rhône-Alpes", "93": "Provence-Alpes-Côte d'Azur", "94": "Corse",
};

/** Tranches d'effectif salarié INSEE. */
export const EFFECTIFS: Record<string, { min: number; max: number; label: string }> = {
  "00": { min: 0, max: 0, label: "0 salarié" },
  "01": { min: 1, max: 2, label: "1 à 2 salariés" },
  "02": { min: 3, max: 5, label: "3 à 5 salariés" },
  "03": { min: 6, max: 9, label: "6 à 9 salariés" },
  "11": { min: 10, max: 19, label: "10 à 19 salariés" },
  "12": { min: 20, max: 49, label: "20 à 49 salariés" },
  "21": { min: 50, max: 99, label: "50 à 99 salariés" },
  "22": { min: 100, max: 199, label: "100 à 199 salariés" },
  "31": { min: 200, max: 249, label: "200 à 249 salariés" },
  "32": { min: 250, max: 499, label: "250 à 499 salariés" },
  "41": { min: 500, max: 999, label: "500 à 999 salariés" },
  "42": { min: 1000, max: 1999, label: "1 000 à 1 999 salariés" },
  "51": { min: 2000, max: 4999, label: "2 000 à 4 999 salariés" },
  "52": { min: 5000, max: 9999, label: "5 000 à 9 999 salariés" },
  "53": { min: 10000, max: 1_000_000, label: "10 000 salariés et plus" },
};
