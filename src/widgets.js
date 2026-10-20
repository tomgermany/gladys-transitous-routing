
import { logger } from '@gladysassistant/integration-sdk';
import { getRoute } from './transitous.js';

export const TRANSITOUS_ROUTING_WIDGET = 'transitous_routing';

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
