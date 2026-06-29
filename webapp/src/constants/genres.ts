// Canonical genre list — sourced from Discogs taxonomy (already integrated provider).
// ponytail: static list beats a network call; extend here, not in the DB.
export const GENRES: readonly string[] = [
  // Electronic
  "Ambient", "Bass Music", "Breakbeat", "Chillwave", "Club",
  "Dark Ambient", "Deep House", "Disco", "Drone", "Drum n Bass",
  "Dub", "Dub Techno", "Dubstep", "EBM", "Electro", "Electronic",
  "Footwork", "Grime", "Happy Hardcore", "Hardcore", "Hardcore Techno",
  "House", "IDM", "Industrial", "Jungle", "Lo-Fi", "Minimal Techno",
  "Noise", "Nu-Disco", "Synthpop", "Techno", "Trance", "Trip Hop",
  "UK Garage", "Vaporwave",
  // Rock
  "Alternative Rock", "Art Rock", "Classic Rock", "Death Metal", "Doom Metal",
  "Folk Rock", "Garage Rock", "Glam Rock", "Gothic Rock", "Grunge",
  "Hard Rock", "Heavy Metal", "Indie Rock", "Math Rock", "Metalcore",
  "New Wave", "Noise Rock", "Post-Hardcore", "Post-Punk", "Post-Rock",
  "Power Metal", "Progressive Metal", "Progressive Rock", "Psychedelic Rock",
  "Punk Rock", "Rock", "Shoegaze", "Sludge Metal", "Space Rock",
  "Stoner Rock", "Thrash Metal",
  // Pop
  "Art Pop", "Dance Pop", "Dream Pop", "Electropop", "Indie Pop",
  "J-Pop", "K-Pop", "Pop", "Teen Pop",
  // Hip-Hop
  "Boom Bap", "Cloud Rap", "Conscious Hip-Hop", "East Coast Hip-Hop",
  "G-Funk", "Gangsta Rap", "Hip-Hop", "Lo-Fi Hip-Hop", "Rap", "Trap",
  "West Coast Hip-Hop",
  // R&B / Soul
  "Blues", "Contemporary R&B", "Funk", "Gospel", "Neo Soul", "R&B", "Soul",
  // Jazz
  "Acid Jazz", "Bebop", "Contemporary Jazz", "Cool Jazz", "Experimental Jazz",
  "Free Jazz", "Fusion", "Jazz", "Latin Jazz", "Nu Jazz", "Smooth Jazz", "Swing",
  // Classical
  "Baroque", "Chamber Music", "Classical", "Contemporary Classical",
  "Early Music", "Minimalism", "Opera", "Orchestral", "Romantic",
  // Folk / Country
  "Bluegrass", "Country", "Folk", "Indie Folk", "Neo-Folk", "Singer-Songwriter",
  // Latin
  "Afrobeat", "Afrobeats", "Bossa Nova", "Cumbia", "Latin", "Merengue",
  "Reggaeton", "Salsa", "Samba", "Tango",
  // Reggae
  "Dancehall", "Reggae", "Ska", "Rocksteady",
  // World
  "Celtic", "Fado", "Flamenco", "Indian Classical", "Middle Eastern", "Worldbeat",
  // Other
  "Avant-Garde", "Children's", "Experimental", "Instrumental",
  "Meditation", "New Age", "Podcast", "Soundtrack",
  "Spoken Word", "Video Game Music",
] as const;

// Build lookup: strip hyphens, spaces, ampersands, lowercase → canonical name.
// Handles "synth-pop" → "Synthpop", "hard-core" → "Hardcore", "hip-hop" → "Hip-Hop", "r&b" → "R&B".
const _lookup = new Map<string, string>();
for (const g of GENRES) {
  _lookup.set(g.toLowerCase().replace(/[-\s&]/g, ""), g);
}

export function normalizeGenre(input: string): string | null {
  return _lookup.get(input.toLowerCase().replace(/[-\s&]/g, "")) ?? null;
}
