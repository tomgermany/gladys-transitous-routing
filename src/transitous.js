
import { geocode, plan } from '@motis-project/motis-client';

const TRANSITOUS_API = 'https://api.transitous.org';
const REQUEST_TIMEOUT_MS = 15000;

const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Gladys-Transitous-Routing/1.0',
  Referer: 'https://github.com/tomgermany/gladys-transitous-routing',
};

function hasCoordinate(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== '' &&
    Number.isFinite(Number(value))
  );
}

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
    throw new Error('Der Zeitzonenoffset für Europe/Berlin ist unbekannt.');
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
    throw new Error('Die lokale Abfahrtszeit konnte nicht umgerechnet werden.');
  }

  return `${isoDate}T${isoTime}${actualOffset.slice(3)}`;
}

async function callMotis(operation, query) {
  return operation({
    throwOnError: true,
    baseUrl: TRANSITOUS_API,
    headers: HEADERS,
    query,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function getResponseData(response) {
  // Die Funktion unterstützt sowohl direkte Daten als auch die üblichen
  // { data: ... }-Antworten generierter HTTP-Clients.
  return response?.data ?? response;
}

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
        '\n\nFahrplandaten: Transitous',
    };
  });
}
