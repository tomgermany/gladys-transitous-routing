
import { logger } from '@gladysassistant/integration-sdk';

export const TRANSITOUS_ROUTING_WIDGET = 'transitous_routing';

const TRANSITOUS_API = 'https://api.transitous.org';
const REQUEST_TIMEOUT_MS = 15000;

const routeResults = new Map();

let gladysHouses = [];

function getWidgetKey(settings = {}) {
  return JSON.stringify(settings);
}

export async function refreshHouses(gladys) {
  const houses = await gladys.getHouses();

  if (!Array.isArray(houses)) {
    throw new Error('getHouses() hat keine gültige Hausliste geliefert.');
  }

  gladysHouses = houses;

  logger.info(
    `[Transitous] ${gladysHouses.length} Gladys-Haus/Häuser geladen.`,
  );
}

function resolveHouse(settings = {}) {
  if (settings.house) {
    const configuredHouse = gladysHouses.find(
      (house) => house.selector === settings.house,
    );

    if (configuredHouse) {
      return configuredHouse;
    }

    logger.info(
      '[Transitous] Konfiguriertes Haus nicht gefunden; ' +
        'verwende ein verfügbares Haus als Standard.',
    );
  }

  return gladysHouses[0] ?? null;
}

function hasCoordinate(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== '' &&
    Number.isFinite(Number(value))
  );
}

function getConfiguration(settings = {}) {
  const selectedHouse = resolveHouse(settings);

  const houseLatitude = selectedHouse?.latitude;
  const houseLongitude = selectedHouse?.longitude;

  const latitude = hasCoordinate(houseLatitude)
    ? houseLatitude
    : settings.latitude;

  const longitude = hasCoordinate(houseLongitude)
    ? houseLongitude
    : settings.longitude;

  if (selectedHouse) {
    logger.info(
      `[Transitous] Konfiguriertes Haus: "${selectedHouse.name}". ` +
        `Breitengrad vorhanden: ${hasCoordinate(houseLatitude)}; ` +
        `Längengrad vorhanden: ${hasCoordinate(houseLongitude)}.`,
    );
  }

  return {
    house: selectedHouse?.name ?? '(nicht gesetzt)',
    latitude: latitude ?? '(nicht gesetzt)',
    longitude: longitude ?? '(nicht gesetzt)',
    contact: settings.contact ?? '(nicht gesetzt)',
  };
}

function isValidDate(value) {
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
    return false;
  }

  const [day, month, year] = value.split('.').map(Number);

  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  const isLeapYear =
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

  const daysPerMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return day <= daysPerMonth[month - 1];
}

function isValidTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hours, minutes] = value.split(':').map(Number);

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

// Berlin-Zeitzonenoffset für ein konkretes Datum und eine Uhrzeit bestimmen.
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

  // Zunächst mit UTC als Näherung den passenden Offset bestimmen.
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

  const utcTimestamp = localAsUtc - offsetMinutes * 60 * 1000;
  const utcDate = new Date(utcTimestamp);

  const isoDate =
    `${String(year).padStart(4, '0')}-` +
    `${String(month).padStart(2, '0')}-` +
    `${String(day).padStart(2, '0')}`;

  const isoTime =
    `${String(hours).padStart(2, '0')}:` +
    `${String(minutes).padStart(2, '0')}:00`;

  // Den Offset am tatsächlich berechneten Zeitpunkt erneut prüfen.
  const actualOffset = formatter
    .formatToParts(utcDate)
    .find((part) => part.type === 'timeZoneName')?.value;

  if (!actualOffset || !/^GMT[+-]\d{2}:\d{2}$/.test(actualOffset)) {
    throw new Error('Die lokale Abfahrtszeit konnte nicht umgerechnet werden.');
  }

  return `${isoDate}T${isoTime}${actualOffset.slice(3)}`;
}

async function fetchTransitous(path, params = {}) {
  const url = new URL(path, TRANSITOUS_API);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Gladys-Transitous-Routing/1.0',
      Referer: 'https://github.com/tomgermany/gladys-transitous-routing',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Transitous antwortet mit HTTP ${response.status}.`);
  }

  return response.json();
}

// Die Geocoding-API liefert passende Orte und gegebenenfalls Haltestellen.
async function geocodePlace(query) {
  const data = await fetchTransitous('/api/v1/geocode', {
    text: query,
    language: 'de',
  });

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

async function getRoute({
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

  const data = await fetchTransitous('/api/v6/plan', {
    fromPlace: `${fromPlace.lat},${fromPlace.lon}`,
    toPlace: `${toPlace.lat},${toPlace.lon}`,
    time: toBerlinDateTime(date, time),
    arriveBy: false,
    numItineraries: 5,
    timetableView: true,
    language: 'de',
  });

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

function createRouteFields(settings = {}) {
  const selectedHouse = resolveHouse(settings);

  const defaultDate = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return [
    {
      key: 'start',
      type: 'string',
      required: true,
      label: {
        de: 'Start',
        en: 'Departure',
        fr: 'Départ',
      },
      default: selectedHouse?.name ?? '',
    },
    {
      key: 'destination',
      type: 'string',
      required: true,
      label: {
        de: 'Ziel',
        en: 'Destination',
        fr: 'Destination',
      },
    },
    {
      key: 'date',
      type: 'string',
      required: true,
      label: {
        de: 'Datum (TT.MM.JJJJ)',
        en: 'Date (DD.MM.YYYY)',
        fr: 'Date (JJ.MM.AAAA)',
      },
      default: defaultDate,
    },
    {
      key: 'time',
      type: 'string',
      required: true,
      label: {
        de: 'Uhrzeit (HH:mm)',
        en: 'Time (HH:mm)',
        fr: 'Heure (HH:mm)',
      },
      default: '08:15',
    },
  ];
}

function createRouteButton(settings = {}) {
  return {
    type: 'button',
    label: {
      de: 'Route suchen',
      en: 'Find route',
      fr: 'Rechercher un trajet',
    },
    icon: 'map-pin',
    style: 'primary',
    action: {
      key: 'get_route',
      fields: createRouteFields(settings),
    },
  };
}

export const WIDGETS = {
  [TRANSITOUS_ROUTING_WIDGET]: {
    async get(gladys, { settings = {} } = {}) {
      const savedRoutes = routeResults.get(getWidgetKey(settings));
      const components = [];

      if (savedRoutes) {
        components.push({
          type: 'card-list',
          display: 'list',
          items: savedRoutes,
        });
      }

      components.push(createRouteButton(settings));

      return {
        ttl_seconds: 60,
        components,
      };
    },

    async action(gladys, { actionKey, settings = {}, values } = {}) {
      if (actionKey !== 'get_route') {
        return;
      }

      const requiredFields = ['start', 'destination', 'date', 'time'];

      const missingFields = requiredFields.filter((key) => {
        const value = values?.[key];

        return typeof value !== 'string' || value.trim() === '';
      });

      if (missingFields.length > 0) {
        return {
          de: 'Bitte alle vier Formularfelder ausfüllen.',
          en: 'Please complete all four form fields.',
          fr: 'Veuillez remplir les quatre champs du formulaire.',
        };
      }

      const start = values.start.trim();
      const destination = values.destination.trim();
      const date = values.date.trim();
      const time = values.time.trim();

      if (!isValidDate(date) || !isValidTime(time)) {
        return {
          de:
            'Datum oder Uhrzeit ungültig. Bitte TT.MM.JJJJ und HH:mm ' +
            'verwenden, z. B. 21.10.2026 und 08:15.',
          en:
            'Invalid date or time. Use DD.MM.YYYY and HH:mm, ' +
            'e.g. 21.10.2026 and 08:15.',
          fr:
            'Date ou heure invalide. Utilisez JJ.MM.AAAA et HH:mm.',
        };
      }

      const configuration = getConfiguration(settings);

      let routes;

      try {
        routes = await getRoute({
          start,
          destination,
          date,
          time,
          configuration,
        });
      } catch (err) {
        logger.error('[Transitous] Routensuche fehlgeschlagen.', err);

        return {
          de:
            'Die Routensuche ist fehlgeschlagen. Bitte Ortsnamen prüfen ' +
            'und es später erneut versuchen.',
          en:
            'Route search failed. Please check the place names and try again later.',
          fr:
            'La recherche a échoué. Vérifiez les lieux et réessayez plus tard.',
        };
      }

      if (routes.length === 0) {
        routeResults.delete(getWidgetKey(settings));

        logger.info('[Transitous] Keine Verbindungen gefunden.');

        return {
          de: 'Für diese Angaben wurden keine Verbindungen gefunden.',
          en: 'No connections were found for these details.',
          fr: 'Aucun trajet trouvé pour ces paramètres.',
        };
      }

      routeResults.set(getWidgetKey(settings), routes);

      logger.info(
        `[Transitous] ${routes.length} echte Verbindungen geladen.`,
      );

      return {
        de: `${routes.length} Transitous-Verbindungen gefunden.`,
        en: `${routes.length} Transitous connections found.`,
        fr: `${routes.length} trajets Transitous trouvés.`,
      };
    },
  },
};

export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
