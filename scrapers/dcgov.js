// src/scrapers/dcgov.js
// Fetches events from DC government open data sources:
//   - DC Events API (open.dc.gov)
//   - DC Parks & Recreation events
//   - Smithsonian open data
// These are free, family-friendly events that Washington Parent's audience loves.

import axios from 'axios';
import { SEARCH } from '../../config/settings.js';
import { scoreEvent, normalizeEvent } from '../utils/scorer.js';
import { log } from '../utils/logger.js';

const SOURCES = [
  {
    name: 'DC Open Data Events',
    url: 'https://opendata.dc.gov/api/v3/datasets/events/records',
    parser: parseDCOpenData,
  },
  {
    name: 'Smithsonian Events',
    url: 'https://api.si.edu/openaccess/api/v1.0/search',
    parser: parseSmithsonian,
  },
  {
    name: 'NPS Events (National Parks)',
    url: 'https://developer.nps.gov/api/v1/events',
    parser: parseNPS,
  },
];

export async function fetchDCGovEvents() {
  log.info('🏛  Fetching DC Government & Smithsonian events...');

  const allEvents = [];

  // DC Open Data
  try {
    const events = await fetchDCOpenData();
    allEvents.push(...events);
  } catch (err) {
    log.warn(`  DC Open Data failed: ${err.message}`);
  }

  // NPS (National Mall, Rock Creek Park, etc.)
  try {
    const events = await fetchNPSEvents();
    allEvents.push(...events);
  } catch (err) {
    log.warn(`  NPS Events failed: ${err.message}`);
  }

  // Smithsonian
  try {
    const events = await fetchSmithsonianEvents();
    allEvents.push(...events);
  } catch (err) {
    log.warn(`  Smithsonian Events failed: ${err.message}`);
  }

  log.success(`  ✓ DC Gov/Public: ${allEvents.length} events fetched`);
  return allEvents;
}

// ─── DC Open Data ─────────────────────────────────────────────────────────────

async function fetchDCOpenData() {
  const startDate = new Date().toISOString().split('T')[0];
  const endDate = new Date(Date.now() + SEARCH.daysAhead * 86400000)
    .toISOString().split('T')[0];

  const response = await axios.get(
    'https://opendata.dc.gov/api/explore/v2.1/catalog/datasets/events/records',
    {
      params: {
        where: `start_date >= '${startDate}' AND start_date <= '${endDate}'`,
        limit: 100,
        order_by: 'start_date',
      },
      timeout: 15000,
    }
  );

  const records = response.data?.results || [];
  return records.map(r => {
    const normalized = normalizeEvent({
      source: 'dcgov',
      sourceId: `dcgov-${r.objectid || r.eventid}`,
      sourceUrl: r.event_url || r.url || '',
      title: r.name || r.title || '',
      description: r.description || r.details || '',
      startDate: r.start_date,
      endDate: r.end_date,
      venueName: r.venue_name || r.location || '',
      address: r.address || r.street || '',
      city: r.city || 'Washington',
      state: r.state || 'DC',
      zip: r.zipcode || '',
      isFree: true, // DC gov events are typically free
      ticketUrl: r.event_url || '',
      organizerName: r.organizer || 'DC Government',
      tags: ['government', 'dc', 'free'],
    });
    const score = scoreEvent(normalized);
    return { ...normalized, score, source: 'dcgov' };
  });
}

// ─── National Park Service ─────────────────────────────────────────────────────

async function fetchNPSEvents() {
  // DC-area park codes
  const parkCodes = ['naca', 'rocr', 'nama', 'gwmp', 'this', 'cahi'].join(',');

  const startDate = new Date().toISOString().split('T')[0];
  const endDate = new Date(Date.now() + SEARCH.daysAhead * 86400000)
    .toISOString().split('T')[0];

  const response = await axios.get('https://developer.nps.gov/api/v1/events', {
    params: {
      parkCode: parkCodes,
      dateStart: startDate,
      dateEnd: endDate,
      limit: 100,
      api_key: process.env.NPS_API_KEY || 'DEMO_KEY', // Free key available at nps.gov/subjects/digital/nps-data-api.htm
    },
    timeout: 15000,
  });

  const events = response.data?.data || [];
  return events.map(e => {
    const normalized = normalizeEvent({
      source: 'nps',
      sourceId: `nps-${e.id}`,
      sourceUrl: e.infoURL || `https://www.nps.gov/planyourvisit/events-details.htm?id=${e.id}`,
      title: e.title || '',
      description: e.description || '',
      startDate: `${e.dates?.[0]} ${e.times?.[0]?.timestart || ''}`.trim(),
      endDate: `${e.dates?.[e.dates?.length - 1]} ${e.times?.[0]?.timeend || ''}`.trim(),
      venueName: e.location || e.parkFullName || '',
      city: 'Washington',
      state: 'DC',
      isFree: e.isfree === '1' || e.isfree === true,
      ticketUrl: e.infoURL || '',
      organizerName: e.organizationName || 'National Park Service',
      imageUrl: e.images?.[0]?.url || '',
      tags: ['national park', 'outdoors', 'free', ...(e.tags || [])],
    });
    const score = scoreEvent(normalized);
    return { ...normalized, score, source: 'nps' };
  });
}

// ─── Smithsonian ───────────────────────────────────────────────────────────────

async function fetchSmithsonianEvents() {
  const response = await axios.get('https://api.si.edu/openaccess/api/v1.0/search', {
    params: {
      q: 'family children education kids program',
      type: 'edanmdm',
      api_key: process.env.SMITHSONIAN_API_KEY || 'DEMO_KEY', // Free at api.si.edu
    },
    timeout: 15000,
  });

  // Smithsonian returns museum objects, not events — skip if no useful data
  // For actual Smithsonian events, scrape their calendar page:
  return await fetchSmithsonianCalendar();
}

async function fetchSmithsonianCalendar() {
  try {
    const response = await axios.get(
      'https://www.si.edu/events?type%5B0%5D=program&audience%5B0%5D=families',
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WashingtonParentBot/1.0)' },
        timeout: 15000,
      }
    );

    // Basic HTML parse for event links — Smithsonian uses structured data
    const cheerio = await import('cheerio');
    const $ = cheerio.load(response.data);
    const events = [];

    $('article.views-row, .event-card, [data-type="event"]').each((_, el) => {
      const title = $(el).find('h3, .event-title, .title').first().text().trim();
      const date = $(el).find('time, .date, .event-date').first().attr('datetime')
        || $(el).find('time, .date').first().text().trim();
      const link = $(el).find('a').first().attr('href');
      const description = $(el).find('.field-content, .description, p').first().text().trim();

      if (title) {
        const normalized = normalizeEvent({
          source: 'smithsonian',
          sourceId: `si-${Buffer.from(title + date).toString('base64').slice(0, 12)}`,
          sourceUrl: link ? `https://www.si.edu${link}` : 'https://www.si.edu/events',
          title,
          description,
          startDate: date,
          venueName: 'Smithsonian Institution',
          city: 'Washington',
          state: 'DC',
          isFree: true,
          organizerName: 'Smithsonian Institution',
          tags: ['museum', 'free', 'education', 'family'],
        });
        const score = scoreEvent(normalized);
        events.push({ ...normalized, score, source: 'smithsonian' });
      }
    });

    return events;
  } catch {
    return []; // graceful fallback
  }
}