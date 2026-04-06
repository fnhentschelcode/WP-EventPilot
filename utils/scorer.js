// src/utils/scorer.js
// Scores events for Washington Parent editorial fit (family-friendly, DMV-relevant).
// Returns a score object with breakdown so editors can see why an event was flagged.

import { FAMILY_KEYWORDS, EXCLUDE_KEYWORDS, MIN_SCORE_TO_STAGE } from '../../config/settings.js';

/**
 * Normalize raw event data from any source into our standard schema.
 */
export function normalizeEvent(raw) {
  return {
    source: raw.source || 'unknown',
    sourceId: String(raw.sourceId || ''),
    sourceUrl: raw.sourceUrl || '',
    title: clean(raw.title),
    description: clean(raw.description),
    startDate: parseDate(raw.startDate),
    endDate: parseDate(raw.endDate),
    timezone: raw.timezone || 'America/New_York',
    venueName: clean(raw.venueName),
    address: clean(raw.address),
    city: clean(raw.city),
    state: clean(raw.state),
    zip: clean(raw.zip),
    lat: raw.lat ? String(raw.lat) : null,
    lng: raw.lng ? String(raw.lng) : null,
    imageUrl: raw.imageUrl || '',
    isFree: Boolean(raw.isFree),
    ticketUrl: raw.ticketUrl || raw.sourceUrl || '',
    priceMin: raw.priceMin ?? null,
    priceMax: raw.priceMax ?? null,
    organizerName: clean(raw.organizerName),
    categories: raw.categories || [],
    tags: (raw.tags || []).map(t => clean(String(t))).filter(Boolean),
    importedAt: new Date().toISOString(),
  };
}

/**
 * Score an event for Washington Parent editorial fit.
 * Returns { total, breakdown, recommendation }
 */
export function scoreEvent(event) {
  const text = [event.title, event.description, ...event.tags]
    .join(' ')
    .toLowerCase();

  const breakdown = {};

  // ── Positive signals ────────────────────────────────────────────────────────

  // Family keyword matches (up to 40 pts)
  const familyMatches = FAMILY_KEYWORDS.filter(kw => text.includes(kw.toLowerCase()));
  breakdown.familyKeywords = Math.min(familyMatches.length * 8, 40);
  breakdown.matchedKeywords = familyMatches;

  // Free event bonus (10 pts) — WP readers love free content
  breakdown.free = event.isFree ? 10 : 0;

  // Has image (5 pts) — events with images look better in the calendar
  breakdown.hasImage = event.imageUrl ? 5 : 0;

  // Has description (5 pts)
  breakdown.hasDescription = event.description.length > 50 ? 5 : 0;

  // Is in DC/MD/VA (10 pts)
  const dmvStates = ['dc', 'md', 'va', 'washington'];
  const locationText = [event.city, event.state].join(' ').toLowerCase();
  breakdown.isDMV = dmvStates.some(s => locationText.includes(s)) ? 10 : 0;

  // Government / museum / NPS sources get a boost (10 pts) — high credibility
  const trustedSources = ['dcgov', 'nps', 'smithsonian'];
  breakdown.trustedSource = trustedSources.includes(event.source) ? 10 : 0;

  // ── Negative signals ────────────────────────────────────────────────────────

  // Exclude keywords
  const excludeMatches = EXCLUDE_KEYWORDS.filter(kw => text.includes(kw.toLowerCase()));
  breakdown.excludeKeywords = excludeMatches.length * -25;
  breakdown.excludeMatched = excludeMatches;

  // No date = not useful
  breakdown.noDate = event.startDate ? 0 : -20;

  // No venue (online-only events are less useful for WP)
  breakdown.noVenue = event.venueName ? 0 : -10;

  // ── Total ────────────────────────────────────────────────────────────────────

  const total = Object.entries(breakdown)
    .filter(([k]) => typeof breakdown[k] === 'number' && !['total'].includes(k))
    .reduce((sum, [, v]) => sum + v, 0);

  const recommendation = excludeMatches.length > 0
    ? 'EXCLUDE'
    : total >= MIN_SCORE_TO_STAGE
      ? 'STAGE'
      : 'LOW_RELEVANCE';

  return {
    total: Math.max(total, 0),
    breakdown,
    recommendation,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clean(str) {
  if (!str) return '';
  return String(str)
    .replace(/<[^>]*>/g, '') // strip HTML
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(raw) {
  if (!raw) return null;
  try {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}