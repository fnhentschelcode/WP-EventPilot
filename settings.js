// config/settings.js
// Central configuration for the Washington Parent event ingestion pipeline

export const SEARCH = {
    // DMV metro area
    lat: process.env.SEARCH_LAT || '38.9072',
    lng: process.env.SEARCH_LNG || '-77.0369',
    radiusMiles: parseInt(process.env.SEARCH_RADIUS_MILES || '30'),
    daysAhead: parseInt(process.env.SEARCH_DAYS_AHEAD || '60'),
    location: 'Washington, DC',
  };
  
  // Eventbrite category IDs that align with Washington Parent's editorial focus
  export const EVENTBRITE_CATEGORIES = [
    '110', // Food & Drink
    '113', // Community & Culture
    '115', // Performing Arts
    '116', // Film & Media
    '117', // Science & Technology
    '119', // Sports & Fitness
    '120', // Travel & Outdoor
    '199', // Family & Education  ← primary
  ];
  
  // Keywords that signal family-friendly content (used for scoring)
  export const FAMILY_KEYWORDS = [
    'family', 'kids', 'children', 'child', 'toddler', 'baby', 'infant',
    'preschool', 'elementary', 'youth', 'teen', 'tween', 'all ages',
    'parent', 'parents', 'mom', 'dad', 'moms', 'dads',
    'summer camp', 'camp', 'field trip', 'storytime', 'story time',
    'playground', 'festival', 'carnival', 'parade', 'nature',
    'museum', 'zoo', 'aquarium', 'library', 'education', 'learning',
    'workshop for kids', 'arts and crafts', 'stem', 'steam',
    'easter', 'halloween', 'holiday', 'christmas', 'thanksgiving',
  ];
  
  // Keywords that disqualify an event (adult-only, etc.)
  export const EXCLUDE_KEYWORDS = [
    '21+', '21 and over', '21 & over', 'adults only', 'adult only',
    'bar crawl', 'bar hop', 'nightclub', 'speed dating', 'singles',
    'wine tasting only', 'cannabis', 'cbd', 'hemp',
    'comedy for adults', 'burlesque', 'bachelorette',
  ];
  
  // Minimum relevance score (0-100) to auto-stage an event for review
  export const MIN_SCORE_TO_STAGE = 30;
  
  // CitySpark category mapping (their category names)
  export const CITYSPARK_CATEGORIES = {
    arts: 'Arts & Entertainment',
    education: 'Classes & Workshops',
    family: 'Family & Kids',
    festival: 'Festivals & Fairs',
    food: 'Food & Drink',
    music: 'Music',
    outdoor: 'Outdoors & Recreation',
    sports: 'Sports',
    theater: 'Theater & Dance',
  };
  
  // Data file paths
  export const PATHS = {
    staged: './data/staged',
    submitted: './data/submitted',
    logs: './data/logs',
    dedup: './data/submitted/submitted-ids.json',
  };