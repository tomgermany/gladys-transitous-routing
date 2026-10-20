
import { geocode, plan } from '@motis-project/motis-client';

const TRANSITOUS_API = 'https://api.transitous.org';
const REQUEST_TIMEOUT_MS = 15000;

const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Gladys-Transitous-Routing/1.0',
  Referer: 'https://github.com/tomgermany/gladys-transitous-routing',
};

/**
 * Gemeinsame Farbzuordnung aus gladys-transitous-departures.
 *
 * Ausschließlich die vom Gladys-SDK unterstützten semantischen
 * Farbnamen verwenden.
 */
const CATEGORY_COLORS = {
  BUS: 'success',
  REGIONAL: 'info',
  SPECIAL: 'neutral',
  URBAN: 'warning',
  RAIL: 'primary',
};

/**
 * Prüft, ob ein Wert als Koordinate verwendet werden kann.
 */
function hasCoordinate(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== '' &&
    Number.isFinite(Number(value))
  );
}

/**
 * Ordnet Verkehrsmittel derselben Kategorie wie im Parallelprojekt zu.
 */
function modeCategory(mode) {
  const normalized = String(mode ?? '').toUpperCase();

  if (normalized === 'BUS') return 'BUS';

  if (
    [
      'RAIL',
      'REGIONAL_RAIL',
      'REGIONAL_FAST_RAIL',
      'SUBURBAN',
    ].includes(normalized)
  ) {
    return 'REGIONAL';
  }

  if (
    ['ODM', 'FERRY', 'AIRPLANE', 'FUNICULAR'].includes(normalized)
  ) {
    return 'SPECIAL';
  }

  if (['TRAM', 'SUBWAY'].includes(normalized)) {
    return 'URBAN';
  }

  if (
    [
      'HIGHSPEED_RAIL',
      'HIGH_SPEED_RAIL',
      'LONG_DISTANCE',
      'NIGHT_RAIL',
    ].includes(normalized)
  ) {
    return 'RAIL';
  }

  return null;
}

/**
 * Liefert eine verständliche Bezeichnung, falls keine Liniennummer
 * vorhanden ist.
 */
function displayedMode(mode) {
  const normalized = String(mode ?? '').toUpperCase();

  const labels = {
    BUS: 'BUS',
    ODM: 'BUS',
    FERRY: 'FÄHRE',
    AIRPLANE: 'FLUG',
    FUNICULAR: 'STANDSEILBAHN',
    TRAM: 'TRAM',
    SUBWAY: 'U-BAHN',
    SUBURBAN: 'S-BAHN',
    RAIL: 'BAHN',
    REGIONAL_RAIL: 'BAHN',
    REGIONAL_FAST_RAIL: 'BAHN',
    HIGHSPEED_RAIL: 'FERN',
    HIGH_SPEED_RAIL: 'FERN',
    LONG_DISTANCE: 'FERN',
    NIGHT_RAIL: 'FERN',
  };

  return labels[normalized] ?? normalized ?? 'VERKEHR';
}

/**
 * Ermittelt das einzige Badge für eine Verbindung.
 *
 * Es zählt das erste tatsächlich genutzte Verkehrsmittel.
 * Fußwege und reine Umstiegsabschnitte werden übersprungen.
 *
 * Die Farbe entspricht der zentralen Zuordnung des Parallelprojekts.
 * Wenn keine Liniennummer vorhanden ist, wird eine Verkehrsbezeichnung
 * verwendet. Auch dann bleibt es bei genau einem Badge pro Verbindung.
 */
function getLineBadge(legs) {
  const firstTransitLeg = legs.find((leg) => {
    const mode = String(leg.mode ?? '').toUpperCase();

    return mode && !['WALK', 'FOOT', 'TRANSFER'].includes(mode);
  });

  if (!firstTransitLeg) {
    return null;
  }

  const mode = String(firstTransitLeg.mode ?? '').toUpperCase();

  const line =
    firstTransitLeg.routeShortName ??
    firstTransitLeg.trip?.route?.shortName ??
    firstTransitLeg.route?.shortName;

  const text = line
    ? String(line).trim()
    : displayedMode(mode);

  const category = modeCategory(mode);

  return {
    text: text || displayedMode(mode),
    color: CATEGORY_COLORS[category] ?? 'primary',
  };
}

/**
 * Wandelt eine lokale Abfahrtszeit in Europe/Berlin in einen
 * eindeutigen ISO-Zeitstempel mit Zeitzonenoffset um.
 */
function toBerlinDateTime(date, time) {
  const [day, month, year] = date.split('.').map(Number);
  const [hours, minutes] = time.split(':').map(Number);

  const localAsUtc = Date.UTC(year, month - 1, day, hours, minutes);

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    timeZoneName: 'longOffset',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const initialDate = new Date(localAsUtc);
  const initialOffset = formatter
    .formatToParts(initialDate)
    .find((part) => part.type === 'timeZoneName')?.value;

  if (!initialOffset || !/^GMT[+-]\d{2}:\d{2}$/.test(initialOffset)) {
    throw new Error(
      'Der Zeitzonenoffset für Europe/Berlin ist unbekannt.',
    );
  }

  const offsetMatch = initialOffset.match(/GMT([+-])(\d{2}):(\d{2})/);
  const sign = offsetMatch[1] === '+' ? 1 : -1;
  const offsetMinutes =
    sign * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]));

  const utcDate = new Date(localAsUtc - offsetMinutes * 60 * 1000);

  const isoDate =
    `${String(year).padStart(4, '0')}-` +
    `${String(month).padStart(2, '0')}-` +
    `${String(day).padStart(2, '0')}`;

  const isoTime =
    `${String(hours).padStart(2, '0')}:` +
    `${String(minutes).padStart(2, '0')}:00`;

  const actualOffset = formatter
    .formatToParts(utcDate)
    .find((part) => part.type === 'timeZoneName')?.value;

  if (!actualOffset || !/^GMT[+-]\d{2}:\d{2}$/.test(actualOffset)) {
    throw new Error(
      'Die lokale Abfahrtszeit konnte nicht umgerechnet werden.',
    );
  }

  return `${isoDate}T${isoTime}${actualOffset.slice(3)}`;
}

/**
 * Ruft eine MOTIS-Operation über die Transitous-API auf.
 */
async function callMotis(operation, query) {
  return operation({
    throwOnError: true,
    baseUrl: TRANSITOUS_API,
    headers: HEADERS,
    query,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/**
 * Unterstützt direkte Antworten und Antworten mit data-Eigenschaft.
 */
function getResponseData(response) {
  return response?.data ?? response;
}

/**
 * Ermittelt Koordinaten für einen Ortsnamen über die Geocoding-API.
 */
async function geocodePlace(query) {
  const response = await callMotis(geocode, {
    text: query,
    language: 'de',
  });

  const data = getResponseData(response);

  const places = Array.isArray(data)
    ? data
    : Array.isArray(data?.places)
      ? data.places
      : Array.isArray(data?.results)
        ? data.results
        : [];

  const place = places.find(
    (item) =>
      hasCoordinate(item.lat) &&
      hasCoordinate(item.lon),
  );

  if (!place) {
    throw new Error(`Der Ort „${query}“ wurde nicht gefunden.`);
  }

  return {
    lat: Number(place.lat),
    lon: Number(place.lon),
    name: place.name ?? query,
  };
}

/**
 * Formatiert einen Zeitstempel als Uhrzeit in deutscher Ortszeit.
 */
function formatRouteTime(value) {
  if (value === undefined || value === null) {
    return 'unbekannt';
  }

  let date;

  if (typeof value === 'number') {
    date = new Date(value);
  } else if (/^\d+$/.test(String(value))) {
    date = new Date(Number(value));
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Berechnet die Gesamtdauer einer Verbindung.
 */
function formatDuration(start, end) {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return '';
  }

  const minutes = Math.round((endTime - startTime) / 60000);

  if (minutes < 0) {
    return '';
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    return `${hours} Std. ${remainingMinutes} Min.`;
  }

  return `${remainingMinutes} Min.`;
}

/**
 * Unterstützt die unterschiedlichen Bezeichnungen der MOTIS-Antwort.
 */
function getItineraries(data) {
  if (Array.isArray(data?.itineraries)) {
    return data.itineraries;
  }

  if (Array.isArray(data?.connections)) {
    return data.connections;
  }

  if (Array.isArray(data?.journeys)) {
    return data.journeys;
  }

  return [];
}

/**
 * Formatiert einen einzelnen Streckenabschnitt für die Routendetails.
 */
function formatLeg(leg) {
  const from = leg.from?.name ?? leg.from?.id ?? 'Start';
  const to = leg.to?.name ?? leg.to?.id ?? 'Ziel';
  const mode = leg.mode ?? 'Verbindung';

  const line =
    leg.routeShortName ??
    leg.displayName ??
    leg.trip?.route?.shortName;

  return (
    `${formatRouteTime(leg.startTime)} – ` +
    `${formatRouteTime(leg.endTime)}: ` +
    `${mode}${line ? ` ${line}` : ''}\n` +
    `${from} → ${to}`
  );
}

/**
 * Sucht echte Verbindungen über Transitous und liefert Gladys-Cardlist-
 * Einträge einschließlich des einheitlich gestalteten Linien-Badges.
 */
export async function getRoute({
  start,
  destination,
  date,
  time,
  configuration,
}) {
  let fromPlace;

  const startMatchesHouse =
    configuration.house !== '(nicht gesetzt)' &&
    start.localeCompare(configuration.house, 'de', {
      sensitivity: 'base',
    }) === 0;

  if (
    startMatchesHouse &&
    hasCoordinate(configuration.latitude) &&
    hasCoordinate(configuration.longitude)
  ) {
    fromPlace = {
      lat: Number(configuration.latitude),
      lon: Number(configuration.longitude),
      name: configuration.house,
    };
  } else {
    fromPlace = await geocodePlace(start);
  }

  const toPlace = await geocodePlace(destination);

  const response = await callMotis(plan, {
    fromPlace: `${fromPlace.lat},${fromPlace.lon}`,
    toPlace: `${toPlace.lat},${toPlace.lon}`,
    time: toBerlinDateTime(date, time),
    arriveBy: false,
    numItineraries: 5,
    timetableView: true,
    language: 'de',
  });

  const data = getResponseData(response);
  const itineraries = getItineraries(data);

  return itineraries.slice(0, 5).map((itinerary, index) => {
    const legs = itinerary.legs ?? [];
    const departure = itinerary.startTime ?? legs[0]?.startTime;
    const arrival = itinerary.endTime ?? legs.at(-1)?.endTime;

    const transitLegs = legs.filter((leg) => {
      const mode = String(leg.mode ?? '').toUpperCase();

      return mode && !['WALK', 'FOOT', 'TRANSFER'].includes(mode);
    });

    const transfers = Math.max(0, transitLegs.length - 1);
    const duration = formatDuration(departure, arrival);
    const legDetails = legs.map(formatLeg);
    const badge = getLineBadge(legs);

    return {
      title: `Verbindung ${index + 1}`,
      ...(badge ? { badge } : {}),
      subtitle:
        `${formatRouteTime(departure)} – ${formatRouteTime(arrival)}` +
        `${duration ? ` · ${duration}` : ''} · ` +
        `${transfers} Umstieg${transfers === 1 ? '' : 'e'}`,
      description:
        `Start: ${start}\nZiel: ${destination}\n` +
        `Datum: ${date}\nUhrzeit: ${time}\n\n` +
        (legDetails.length
          ? legDetails.join('\n\n')
          : 'Für diese Verbindung liegen keine Detailangaben vor.') +
        '\n\nFahrplandaten: Transitous',
    };
  });
}
