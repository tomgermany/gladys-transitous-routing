
const API_URL = 'https://api.transitous.org/api/v6/stoptimes';
const APP_NAME = 'Gladys Transitous Departures';
const APP_VERSION = '1.5.0';
const DEFAULT_CONTACT = 'https://github.com/tomgermany/gladys-transitous-departures';

// Erlaubter Vorausblick: heute bis einschließlich sieben Tage voraus.
const MAX_DAYS_AHEAD = 7;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Wandelt unterschiedliche Zeitangaben der API in Unix-Millisekunden um.
 * Sekundenwerte werden automatisch in Millisekunden umgerechnet.
 */
function getEpoch(value) {
  if (typeof value === 'number') {
    return value > 1e12 ? value : value * 1000;
  }

  if (typeof value === 'string') {
    const milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }

  return null;
}

function getRawTime(item) {
  return item.departure ?? item.scheduled ?? item.place?.departure ?? null;
}

/**
 * Formatiert einen Zeitpunkt in der lokalen Zeitzone der Haltestelle.
 */
function formatLocalTime(epochMs, timeZone) {
  if (!timeZone) return null;

  try {
    return new Intl.DateTimeFormat('de-DE', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(epochMs));
  } catch {
    return null;
  }
}

/**
 * Berechnet die Luftlinienentfernung zwischen zwei Koordinaten in Metern.
 */
function haversineMeters(lat1, lon1, lat2, lon2) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Ordnet Verkehrsmittel einer gemeinsamen Farbgruppe zu.
 *
 * Diese Kategorien werden in widgets.js für die Farben der
 * Haltestellen-Badges und der Abfahrtskacheln verwendet.
 */
function modeCategory(mode) {
  if (mode === 'BUS') return 'BUS';

  if ([
    'RAIL',
    'REGIONAL_RAIL',
    'REGIONAL_FAST_RAIL',
    'SUBURBAN',
  ].includes(mode)) {
    return 'REGIONAL';
  }

  if (['ODM', 'FERRY', 'AIRPLANE', 'FUNICULAR'].includes(mode)) {
    return 'SPECIAL';
  }

  if (['TRAM', 'SUBWAY'].includes(mode)) {
    return 'URBAN';
  }

  if ([
    'HIGHSPEED_RAIL',
    'HIGH_SPEED_RAIL',
    'LONG_DISTANCE',
    'NIGHT_RAIL',
  ].includes(mode)) {
    return 'RAIL';
  }

  return null;
}

/**
 * Liefert die für die Anzeige vorgesehenen deutschen Verkehrsmittel-Kürzel.
 */
function displayedMode(mode) {
  if (mode === 'FERRY') return 'FÄHRE';
  if (mode === 'SUBWAY') return 'U-BAHN';
  if (mode === 'SUBURBAN') return 'S-BAHN';
  if (mode === 'AIRPLANE') return 'FLUG';

  if (['HIGHSPEED_RAIL', 'HIGH_SPEED_RAIL', 'LONG_DISTANCE'].includes(mode)) {
    return 'FERN';
  }

  if (['REGIONAL_RAIL', 'REGIONAL_FAST_RAIL', 'RAIL'].includes(mode)) {
    return 'BAHN';
  }

  return mode || 'UNKNOWN';
}

/**
 * Vereinheitlicht eine Abfahrt für die weitere Verarbeitung.
 *
 * selectedStopId ist die ID der Haltestelle, für die diese Abfrage
 * gezielt ausgeführt wurde.
 *
 * Falls die API-Antwort keine place.stopId enthält, verwenden wir diese
 * bekannte Abfrage-ID als Zuordnung. Eine vorhandene ID aus der Antwort
 * bleibt dagegen erhalten.
 *
 * Die Kategorie richtet sich nach dem tatsächlichen Verkehrsmittel.
 * Die Kategorie der ausgewählten Haltestelle ist nur ein Rückfallwert.
 */
function normalizeDeparture(
  item,
  selectedStopName,
  selectedCategory,
  selectedStopId,
) {
  const place = item.place ?? {};
  const epochMs = getEpoch(getRawTime(item));
  const mode = item.mode || 'UNKNOWN';

  return {
    epochMs,
    time: epochMs !== null ? formatLocalTime(epochMs, place.tz) : null,
    timezone: place.tz || null,

    stopName: selectedStopName || place.name || 'Unbekannte Haltestelle',

    stopId: place.stopId || selectedStopId || null,

    mode,
    displayedMode: displayedMode(mode),
    category: modeCategory(mode) || selectedCategory || null,
    line: item.routeShortName || item.route?.shortName || '',
    destination: item.headsign || item.tripTo || '',
    status: item.cancelled
      ? 'CANCELLED'
      : item.realtime
        ? 'REALTIME'
        : 'SCHEDULED',
    platform: place.platform || item.platform || '',
  };
}

/**
 * Berechnet den Suchzeitpunkt für die gewählte Anzahl an Tagen voraus.
 *
 * daysAhead = 0: aktueller Zeitpunkt, bisheriges Verhalten.
 * daysAhead = 1: aktueller Zeitpunkt plus 24 Stunden.
 * daysAhead = 2: aktueller Zeitpunkt plus 48 Stunden.
 * ...
 * daysAhead = 7: aktueller Zeitpunkt plus 168 Stunden.
 *
 * Der Zeitpunkt wird als ISO-8601-Zeitstempel mit UTC-Kennzeichnung
 * an Transitous übergeben. Dadurch ist der Zeitpunkt eindeutig und
 * nicht von der Zeitzone des Gladys-Servers abhängig.
 *
 * Hinweis: Das entspricht einer Verschiebung um volle 24-Stunden-Tage.
 * An einem Wechsel zwischen Sommer- und Winterzeit kann sich deshalb
 * die lokale Uhrzeit am Zieltag um eine Stunde unterscheiden.
 */
function getSearchTime(daysAhead = 0) {
  const days = Number(daysAhead);

  // Ungültige Werte sicher auf das bisherige Verhalten zurücksetzen.
  const validDays = Number.isInteger(days) &&
    days >= 0 &&
    days <= MAX_DAYS_AHEAD
    ? days
    : 0;

  return Date.now() + validDays * MILLISECONDS_PER_DAY;
}

/**
 * Ruft Abfahrten entweder für einen konkreten Haltestellen-Identifier
 * oder für einen geografischen Suchbereich ab.
 *
 * searchTime ist der gemeinsame Suchzeitpunkt aller Abfragen eines
 * Widget-Aufrufs. So werden Haltestellensuche und Abfahrtsabfragen
 * auf denselben Zeitpunkt bezogen.
 */
async function transitousQuery({
  lat,
  lon,
  radius,
  stopId,
  searchTime,
  n = 100,
  contact = DEFAULT_CONTACT,
}) {
  const params = new URLSearchParams({
    n: String(n),
    language: 'en',

    // Transitous erwartet einen Datum-Zeit-Wert im ISO-Format.
    // arriveBy=false stellt ausdrücklich sicher, dass wir Abfahrten
    // und nicht Ankünfte abfragen.
    time: new Date(searchTime).toISOString(),
    arriveBy: 'false',
  });

  if (stopId) {
    params.set('stopId', stopId);
  } else {
    params.set('center', `${lat},${lon}`);
    params.set('radius', String(radius));
  }

  const response = await fetch(`${API_URL}?${params}`, {
    headers: {
      'User-Agent': `${APP_NAME}/${APP_VERSION} (${contact})`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Transitous API: HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!Array.isArray(data.stopTimes)) {
    throw new Error('Transitous-Antwort enthält keine stopTimes-Liste');
  }

  return data.stopTimes;
}

/**
 * Liefert die nächsten Abfahrten im Umkreis eines Standorts.
 *
 * lat: Breitengrad
 * lon: Längengrad
 * radius: Suchradius in Metern
 * count: Anzahl der Abfahrten (3 oder 6)
 * daysAhead: Vorausblick von 0 bis 7 Tagen; Standard ist 0
 * contact: Kontaktinformation für den Transitous-User-Agent
 */
export async function getDepartures({
  lat,
  lon,
  radius = 2000,
  count = 6,
  daysAhead = 0,
  contact = DEFAULT_CONTACT,
}) {
  if (
    !Number.isFinite(Number(lat)) ||
    Number(lat) < -90 ||
    Number(lat) > 90 ||
    !Number.isFinite(Number(lon)) ||
    Number(lon) < -180 ||
    Number(lon) > 180
  ) {
    throw new Error('Bitte gültige Koordinaten für den Standort angeben.');
  }

  lat = Number(lat);
  lon = Number(lon);
  radius = Number(radius);
  count = Number(count);

  if (!Number.isFinite(radius) || radius < 1 || radius > 50000) {
    throw new Error('Der Suchradius muss zwischen 1 und 50000 Metern liegen.');
  }

  // Es werden ausschließlich drei oder sechs Abfahrten angeboten.
  // Ungültige Werte werden auf den Standardwert sechs zurückgesetzt.
  if (![3, 6].includes(count)) {
    count = 6;
  }

  // Vorausblick prüfen und den Zielzeitpunkt genau einmal berechnen.
  // Alle nachfolgenden API-Aufrufe verwenden denselben Zeitstempel.
  const requestedDays = Number(daysAhead);
  daysAhead = Number.isInteger(requestedDays) &&
    requestedDays >= 0 &&
    requestedDays <= MAX_DAYS_AHEAD
    ? requestedDays
    : 0;

  const searchTime = getSearchTime(daysAhead);

  // 1. Haltestellen im gewählten Umkreis zum Zielzeitpunkt suchen.
  const initial = await transitousQuery({
    lat,
    lon,
    radius,
    searchTime,
    n: 100,
    contact,
  });

  // 2. Die nächstgelegene Haltestelle jeder Kategorie auswählen.
  const nearestByCategory = new Map();

  for (const item of initial) {
    const place = item.place || {};
    const category = modeCategory(item.mode);

    if (!category || !place.stopId) continue;

    const stopLat = Number(place.lat);
    const stopLon = Number(place.lon);

    if (!Number.isFinite(stopLat) || !Number.isFinite(stopLon)) {
      continue;
    }

    const distance = haversineMeters(lat, lon, stopLat, stopLon);
    const previous = nearestByCategory.get(category);

    if (!previous || distance < previous.distance) {
      nearestByCategory.set(category, {
        category,
        stopId: place.stopId,
        stopName: place.name || 'Unbekannte Haltestelle',
        distance,
      });
    }
  }

  // Die ausgewählten Haltestellen nach Luftlinienentfernung sortieren.
  const selected = [...nearestByCategory.values()].sort(
    (a, b) => a.distance - b.distance,
  );

  if (selected.length === 0) {
    return {
      query: {
        lat,
        lon,
        radius,
        count,
        daysAhead,
        searchTime: new Date(searchTime).toISOString(),
      },
      stopsSelected: [],
      departures: [],
      attribution: 'Transitdaten: Transitous – https://transitous.org/sources/',
    };
  }

  // 3. Abfahrten der ausgewählten Haltestellen gezielt abrufen.
  // Dieselbe Haltestelle wird nur einmal abgefragt, auch wenn sie
  // für mehrere Verkehrsmittelkategorien ausgewählt wurde.
  const uniqueStops = [
    ...new Map(selected.map((stop) => [stop.stopId, stop])).values(),
  ];

  const results = await Promise.all(
    uniqueStops.map(async (stop) => ({
      stopId: stop.stopId,
      stopName: stop.stopName,
      category: stop.category,

      // Auch die Einzelabfrage erhält denselben Suchzeitpunkt.
      stopTimes: await transitousQuery({
        lat,
        lon,
        radius,
        stopId: stop.stopId,
        searchTime,
        n: 100,
        contact,
      }),
    })),
  );

  // 4. Zeiten vereinheitlichen, Abfahrten vor dem Suchzeitpunkt entfernen
  // und chronologisch sortieren.
  //
  // Bei daysAhead = 0 entspricht das dem bisherigen Verhalten.
  // Bei daysAhead > 0 werden Abfahrten vor dem gewählten Zukunftszeitpunkt
  // ausgeschlossen, nicht lediglich solche vor der aktuellen Uhrzeit.
  const normalized = results
    .flatMap((result) =>
      result.stopTimes.map((item) =>
        normalizeDeparture(
          item,
          result.stopName,
          result.category,
          result.stopId,
        ),
      ),
    )
    .filter(
      (item) =>
        item.epochMs !== null &&
        item.epochMs >= searchTime - 60_000,
    )
    .sort((a, b) => a.epochMs - b.epochMs);

  // 5. Doppelte Abfahrten entfernen und die gewünschte Anzahl auswählen.
  const seen = new Set();
  const departures = [];

  for (const item of normalized) {
    const key = `${item.stopId}|${item.line}|${item.destination}|${item.epochMs}`;

    if (seen.has(key)) continue;

    seen.add(key);
    departures.push(item);

    if (departures.length >= count) break;
  }

  return {
    query: {
      lat,
      lon,
      radius,
      count,
      daysAhead,
      searchTime: new Date(searchTime).toISOString(),
    },
    stopsSelected: selected.map((stop) => ({
      category: stop.category,
      name: stop.stopName,
      stopId: stop.stopId,
      distanceMeters: Math.round(stop.distance),
    })),
    departures,
    attribution: 'Transitdaten: Transitous – https://transitous.org/sources/',
  };
}
