// src/scrapers/eventbrite.js
// Fetches family-friendly events from Eventbrite for the DMV area.
//
// Note: Eventbrite deprecated their public /events/search/?location endpoint ~2020.
// We use their internal destination API (same one the website uses) which returns
// rich event data. This is the standard approach used by many integrators.

import axios from 'axios';
import { SEARCH, EVENTBRITE_CATEGORIES, PATHS } from '../../config/settings.js';
import { scoreEvent, normalizeEvent } from '../utils/scorer.js';
import { log } from '../utils/logger.js';

const BASE_URL = 'https://www.eventbrite.com/api/v3/destination/events/';

/**
 * Fetch events from Eventbrite's internal destination API.
 * Paginates through results until daysAhead limit is reached.
 */
export async function fetchEventbriteEvents() {
  log.info('🎟  Fetching Eventbrite events for DMV...');

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + SEARCH.daysAhead);

  const allEvents = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 10) { // cap at 10 pages (~200 events)
    try {
      const response = await axios.get(BASE_URL, {
        params: {
          'place.address.latitude': SEARCH.lat,
          'place.address.longitude': SEARCH.lng,
          within: `${SEARCH.radiusMiles}mi`,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          categories: EVENTBRITE_CATEGORIES.join(','),
          page_size: 20,
          page,
          expand: 'venue,ticket_availability,primary_organizer',
          include_adult_events: false,
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; WashingtonParentBot/1.0)',
          'Accept': 'application/json',
          // If you have a token, add: 'Authorization': `Bearer ${process.env.EVENTBRITE_TOKEN}`
        },
        timeout: 15000,
      });

      const { events, pagination } = response.data;

      if (!events || events.length === 0) {
        hasMore = false;
        break;
      }

      log.info(`  Page ${page}: found ${events.length} events`);

      for (const raw of events) {
        const normalized = normalizeEventbriteEvent(raw);
        const score = scoreEvent(normalized);

        if (score.total >= 0) { // include all, filter later
          allEvents.push({ ...normalized, score, source: 'eventbrite' });
        }
      }

      hasMore = pagination?.has_next_page ?? false;
      page++;

      // Be polite - don't hammer the API
      await sleep(1000);

    } catch (err) {
      if (err.response?.status === 429) {
        log.warn('  Rate limited by Eventbrite, waiting 30s...');
        await sleep(30000);
        continue;
      }
      log.error(`  Eventbrite fetch error on page ${page}: ${err.message}`);
      hasMore = false;
    }
  }

  log.success(`  ✓ Eventbrite: ${allEvents.length} events fetched`);
  return allEvents;
}

/**
 * Map Eventbrite raw event → our normalized schema
 */
function normalizeEventbriteEvent(raw) {
  const venue = raw.venue || {};
  const address = venue.address || {};

  return normalizeEvent({
    source: 'eventbrite',
    sourceId: raw.id,
    sourceUrl: raw.url,
    title: raw.name?.text || raw.name?.html || '',
    description: raw.description?.text || raw.description?.html || '',
    startDate: raw.start?.local || raw.start?.utc,
    endDate: raw.end?.local || raw.end?.utc,
    timezone: raw.start?.timezone,
    venueName: venue.name || '',
    address: [
      address.address_1,
      address.address_2,
    ].filter(Boolean).join(', '),
    city: address.city || '',
    state: address.region || '',
    zip: address.postal_code || '',
    lat: venue.latitude,
    lng: venue.longitude,
    imageUrl: raw.logo?.url || raw.logo?.original?.url || '',
    isFree: raw.is_free ?? false,
    ticketUrl: raw.url,
    priceMin: raw.ticket_availability?.minimum_ticket_price?.major_value,
    priceMax: raw.ticket_availability?.maximum_ticket_price?.major_value,
    organizerName: raw.primary_organizer?.name || '',
    categories: raw.category_id ? [raw.category_id] : [],
    tags: raw.tags?.map(t => t.display_name) || [],
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));