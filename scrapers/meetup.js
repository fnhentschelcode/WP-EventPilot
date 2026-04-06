// src/scrapers/meetup.js
// Fetches family-friendly events from Meetup.com using their GraphQL API.
// Meetup's GraphQL endpoint is publicly accessible for basic queries.

import axios from 'axios';
import { SEARCH } from '../../config/settings.js';
import { scoreEvent, normalizeEvent } from '../utils/scorer.js';
import { log } from '../utils/logger.js';

const MEETUP_GRAPHQL_URL = 'https://www.meetup.com/gql';

const FAMILY_TOPICS = [
  'family', 'parents', 'kids', 'children', 'moms', 'dads',
  'parenting', 'baby', 'toddler', 'school-age', 'outdoor-family',
];

/**
 * Fetch events via Meetup GraphQL API.
 * Uses keyword search + location filter for family-relevant events.
 */
export async function fetchMeetupEvents() {
  log.info('📍 Fetching Meetup events for DMV...');

  const allEvents = [];

  for (const topic of FAMILY_TOPICS.slice(0, 5)) { // sample top 5 topics
    try {
      const events = await fetchMeetupByKeyword(topic);
      allEvents.push(...events);
      await sleep(800);
    } catch (err) {
      log.warn(`  Meetup topic "${topic}" failed: ${err.message}`);
    }
  }

  // Deduplicate by event ID
  const seen = new Set();
  const unique = allEvents.filter(e => {
    if (seen.has(e.sourceId)) return false;
    seen.add(e.sourceId);
    return true;
  });

  log.success(`  ✓ Meetup: ${unique.length} unique events fetched`);
  return unique;
}

async function fetchMeetupByKeyword(keyword) {
  const query = `
    query SearchEvents($input: SearchConnectionInput!) {
      results: searchEvents(input: $input) {
        edges {
          node {
            id
            title
            description
            dateTime
            endTime
            timezone
            eventUrl
            isOnline
            isFree
            venue {
              id
              name
              address
              city
              state
              postalCode
              lat
              lng
            }
            group {
              name
              urlname
            }
            images {
              baseUrl
            }
            maxTickets
            going
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const variables = {
    input: {
      query: keyword,
      lat: parseFloat(SEARCH.lat),
      lon: parseFloat(SEARCH.lng),
      radius: SEARCH.radiusMiles,
      numberOfEventsRequested: 30,
      source: 'EVENTS',
    },
  };

  const response = await axios.post(
    MEETUP_GRAPHQL_URL,
    { query, variables },
    {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; WashingtonParentBot/1.0)',
        // Add API key if you have one:
        // 'Authorization': `Bearer ${process.env.MEETUP_API_KEY}`,
      },
      timeout: 15000,
    }
  );

  const edges = response.data?.data?.results?.edges || [];

  return edges
    .map(({ node }) => {
      const normalized = normalizeMeetupEvent(node);
      const score = scoreEvent(normalized);
      return { ...normalized, score, source: 'meetup' };
    })
    .filter(e => !e.isOnline); // Washington Parent is local-only
}

/**
 * Map Meetup raw event → our normalized schema
 */
function normalizeMeetupEvent(raw) {
  const venue = raw.venue || {};

  return normalizeEvent({
    source: 'meetup',
    sourceId: raw.id,
    sourceUrl: raw.eventUrl,
    title: raw.title || '',
    description: raw.description || '',
    startDate: raw.dateTime,
    endDate: raw.endTime,
    timezone: raw.timezone,
    venueName: venue.name || '',
    address: venue.address || '',
    city: venue.city || '',
    state: venue.state || '',
    zip: venue.postalCode || '',
    lat: venue.lat,
    lng: venue.lng,
    imageUrl: raw.images?.[0]?.baseUrl || '',
    isFree: raw.isFree ?? false,
    ticketUrl: raw.eventUrl,
    organizerName: raw.group?.name || '',
    tags: [raw.group?.urlname].filter(Boolean),
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));