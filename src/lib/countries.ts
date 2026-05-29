// Team name → flag code map for the 48 WC 2026 qualifiers (as seeded from
// FIFA's fixture data). Codes are ISO 3166-1 alpha-2, lowercased; FlagCDN's
// gb-eng / gb-sct subdivisions are used for the home nations.

const TEAM_TO_FLAG: Record<string, string> = {
  "Algeria": "dz",
  "Argentina": "ar",
  "Australia": "au",
  "Austria": "at",
  "Belgium": "be",
  "Bosnia and Herzegovina": "ba",
  "Brazil": "br",
  "Cabo Verde": "cv",
  "Canada": "ca",
  "Colombia": "co",
  "Congo DR": "cd",
  "Croatia": "hr",
  "Curaçao": "cw",
  "Czechia": "cz",
  "Côte d'Ivoire": "ci",
  "Ecuador": "ec",
  "Egypt": "eg",
  "England": "gb-eng",
  "France": "fr",
  "Germany": "de",
  "Ghana": "gh",
  "Haiti": "ht",
  "IR Iran": "ir",
  "Iraq": "iq",
  "Japan": "jp",
  "Jordan": "jo",
  "Korea Republic": "kr",
  "Mexico": "mx",
  "Morocco": "ma",
  "Netherlands": "nl",
  "New Zealand": "nz",
  "Norway": "no",
  "Panama": "pa",
  "Paraguay": "py",
  "Portugal": "pt",
  "Qatar": "qa",
  "Saudi Arabia": "sa",
  "Scotland": "gb-sct",
  "Senegal": "sn",
  "South Africa": "za",
  "Spain": "es",
  "Sweden": "se",
  "Switzerland": "ch",
  "Tunisia": "tn",
  "Türkiye": "tr",
  "USA": "us",
  "Uruguay": "uy",
  "Uzbekistan": "uz",
  // Non-WC nations added for friendlies coverage.
  "Gambia": "gm",
  "Nicaragua": "ni",
  "Andorra": "ad",
  "Lebanon": "lb",
  "Sudan": "sd",
  "North Macedonia": "mk",
};

/** Returns the FlagCDN code for a team name, or null for unknown / placeholder names. */
export function flagCodeFor(teamName: string | null | undefined): string | null {
  if (!teamName) return null;
  return TEAM_TO_FLAG[teamName] ?? null;
}

// Crest URLs for club sides (used in UCL fixtures). Wikimedia-hosted thumbnails
// — should the user want true self-hosting, drop SVGs in public/ and point here.
const CLUB_LOGOS: Record<string, string> = {
  "Paris Saint-Germain": "https://a.espncdn.com/i/teamlogos/soccer/500/160.png",
  "Arsenal":
    "https://upload.wikimedia.org/wikipedia/en/thumb/5/53/Arsenal_FC.svg/120px-Arsenal_FC.svg.png",
};

export function clubLogoFor(teamName: string | null | undefined): string | null {
  if (!teamName) return null;
  return CLUB_LOGOS[teamName] ?? null;
}
