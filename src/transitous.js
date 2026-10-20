
import { geocode, plan } from '@motis-project/motis-client';

const TRANSITOUS_BASE_URL = 'https://api.transitous.org';
const APP_NAME = 'Gladys Transitous Routing';
const APP_VERSION = '0.0.1';
const DEFAULT_CONTACT =
  'https://github.com/tomgermany/gladys-transitous-routing';
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Erzeugt die HTTP-Optionen für den offiziellen MOTIS-Client.
 *
 * Der Kontakt im User-Agent hilft Transitous dabei, die Anwendung
 * zu identifizieren. Die API-Aufrufe selbst erfolgen über den Client.
 */
function getClientOptions(contact = DEFAULT_CONTACT) {
  return {
    throwOnError: true,
    baseUrl: TRANSITOUS_BASE_URL,
    headers: {
      'User-Agent': `${APP_NAME}/${APP_VERSION} (${contact || DEFAULT_CONTACT})`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
}

/**
 * Prüft, ob ein Wert eine gültige geografische Koordinate ist.
 */
function isValidCoordinate(lat, lon) {
  return (
    Number.isFinite(Number(lat)) &&
    Number(lat) >= -90 &&
    Number(lat) <= 90 &&
    Number.isFinite(Number(lon)) &&
    Number(lon) >= -180 &&
    Number(lon) <= 180
  );
}

/**
 * Wandelt Datum und Uhrzeit aus dem Gladys-Formular in einen
 * eindeutigen ISO-8601-Zeitstempel mit dem korrekten Berliner
 * Zeitzonenoffset um.
 *
 * Beispiel:
 * 21.10.2026 und 08:15 -> 2026-10-21T08:15:00+02:00
 */
function toBerlinDateTime(date, time) {
  const [day, month, year] = date.split('.').map(Number);
  const [hours, minutes] = time.split(':').map(Number);

  const localAsUtc = Date.UTC(
    year,
    month - 1,
    day,
    hours,
    minutes,
  );

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    timeZoneName: 'longOffset',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const initialOffset = formatter
    .formatToParts(new Date(localAsUtc))
    .find((part) => part.type === 'timeZoneName')?.value;

  if (!initialOffset || !/^GMT[+-]\d{2}:\d{2}$/.test(initialOffset)) {
    throw new Error(
      'Der Zeitzonenoffset für Europe/Berlin konnte nicht bestimmt werden.',
    );
  }

  const offsetMatch = initialOffset.match(/GMT([+-])(\d{2}):(\d{2})/);
  const sign = offsetMatch[1] === '+' ? 1 : -1;

  const offsetMinutes =
    sign * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]));

  const utcTimestamp = localAsUtc - offsetMinutes * 60 * 1000;
  const actualOffset = formatter
    .formatToParts(new Date(utcTimestamp))
    .find((part) => part.type === 'timeZoneName')?.value;

  if (!actualOffset || !/^GMT[+-]\d{2}:\d{2}$/.test(actualOffset)) {
    throw new Error(
      'Die lokale Abfahrtszeit konnte nicht umgerechnet werden.',
    );
  }

  // Sommerzeitlücken und doppelte Uhrzeiten bei der Zeitumstellung prüfen.
  const verifiedLocalTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(utcTimestamp));

  const expectedLocalTime =
    `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/` +
    `${String(year).padStart(4, '0')}, ` +
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

  if (verifiedLocalTime !== expectedLocalTime) {
    throw new Error(
      'Diese Uhrzeit existiert in Europe/Berlin wegen der Zeitumstellung nicht.',
    );
  }

  const isoDate =
    `${String(year).padStart(4, '0')}-` +
    `${String(month).padStart(2, '0')}-` +
    `${String(day).padStart(2, '0')}`;

  const isoTime =
    `${String(hours).padStart(2, '0')}:` +
    `${String(minutes).padStart(2, '0')}:00`;

  return `${isoDate}T${isoTime}${actualOffset.slice(3)}`;
}

/**
 * Löst einen Ortsnamen über die offizielle MOTIS-Geocoding-Funktion auf.
 *
 * Die API liefert ein Array von Treffern mit name, id, lat und lon.
 * Die Ergebnisse werden nicht als { places: [...] } vorausgesetzt.
 */
async function geocodePlace(query, contact = DEFAULT_CONTACT) {
  const text = String(query ?? '').trim();

  if (!text) {
    throw new Error('Der Ortsname darf nicht leer sein.');
  }

  const places = await geocode({
    ...getClientOptions(contact),
    query: {
      text,
      language: ['de'],
      numResults: 5,
    },
  });

  if (!Array.isArray(places)) {
    throw new Error(
      `Transitous lieferte für „${text}“ eine ungültige Geocoding-Antwort.`,
    );
  }

  const place = places.find(
    (item) =>
      item &&
      isValidCoordinate(item.lat, item.lon),
  );

  if (!place) {
    throw new Error(`Der Ort „${text}“ wurde nicht gefunden.`);
  }

  return {
    lat: Number(place.lat),
    lon: Number(place.lon),
    name: place.name || text,
    id: place.id || null,
    type: place.type || null,
  };
}

/**
 * Formatiert einen Zeitpunkt in deutscher Darstellung.
 */
function formatRouteTime(value) {
  if (value === undefined || value === null) {
    return 'unbekannt';
  }

  const date = new Date(value);

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
 * Formatiert eine Fahrtdauer aus Start- und Endzeit.
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
 * Formatiert einen Abschnitt einer Verbindung.
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
 * Vereinheitlicht die von MOTIS gelieferten Verbindungen für Gladys.
 *
 * Die Funktion erwartet das Itinerary-Array aus der Plan-Antwort.
 * Die Ergebnisobjekte enthalten nur die Daten, die widgets.js zur
 * Darstellung als Gladys-Karten benötigt.
 */
function normalizeRoutes(itineraries, start, destination, date, time) {
  if (!Array.isArray(itineraries)) {
    throw new Error(
      'Transitous lieferte keine gültige Liste von Verbindungen.',
    );
  }

  return itineraries.slice(0, 5).map((itinerary, index) => {
    const legs = Array.isArray(itinerary.legs) ? itinerary.legs : [];
    const departure = itinerary.startTime ?? legs[0]?.startTime;
    const arrival = itinerary.endTime ?? legs.at(-1)?.endTime;

    const transfers = Number.isFinite(itinerary.transfers)
      ? itinerary.transfers
      : Math.max(
          0,
          legs.filter((leg) => {
            const mode = String(leg.mode ?? '').toUpperCase();

            return mode && !['WALK', 'FOOT', 'TRANSFER'].includes(mode);
          }).length - 1,
        );

    const duration = formatDuration(departure, arrival);
    const legDetails = legs.map(formatLeg);

    return {
      title: `Verbindung ${index + 1}`,
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
        '\n\nFahrplandaten: Transitous – https://transitous.org/sources/',
    };
  });
}

/**
 * Sucht echte ÖPNV-Verbindungen zwischen zwei Orten.
 *
 * Öffentliche Schnittstelle für src/widgets.js:
 *
 * const routes = await searchRoutes({
 *   start,
 *   destination,
 *   date,
 *   time,
 *   contact,
 * });
 *
 * Rückgabe: Array von Gladys-kompatiblen Kartenobjekten.
 */
export async function searchRoutes({
  start,
  destination,
  date,
  time,
  contact = DEFAULT_CONTACT,
} = {}) {
  const normalizedStart = String(start ?? '').trim();
  const normalizedDestination = String(destination ?? '').trim();

  if (!normalizedStart || !normalizedDestination) {
    throw new Error('Start und Ziel müssen angegeben werden.');
  }

  if (!date || !time) {
    throw new Error('Datum und Uhrzeit müssen angegeben werden.');
  }

  const departureTime = toBerlinDateTime(date, time);

  // Start und Ziel auflösen. Beide Aufrufe laufen parallel.
  const [fromPlace, toPlace] = await Promise.all([
    geocodePlace(normalizedStart, contact),
    geocodePlace(normalizedDestination, contact),
  ]);

  const response = await plan({
    ...getClientOptions(contact),
    query: {
      fromPlace: `${fromPlace.lat},${fromPlace.lon}`,
      toPlace: `${toPlace.lat},${toPlace.lon}`,
      time: departureTime,
      arriveBy: false,
      language: ['de'],
      numItineraries: 5,
      timetableView: true,
    },
  });

  const itineraries = response?.itineraries;

  if (!Array.isArray(itineraries)) {
    throw new Error(
      'Transitous lieferte eine ungültige Routenantwort.',
    );
  }

  return normalizeRoutes(
    itineraries,
    normalizedStart,
    normalizedDestination,
    date,
    time,
  );
}
