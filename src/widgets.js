
import { logger } from '@gladysassistant/integration-sdk';

export const TRANSITOUS_ROUTING_WIDGET = 'transitous_routing';

// Ergebnisse je Widget-Konfiguration zwischenspeichern.
const routeResults = new Map();

// Neu: Hier halten wir die zuletzt von Gladys geladene Hausliste.
// Die Daten werden später für die dynamische Hausauswahl benötigt.
let gladysHouses = [];

function getWidgetKey(settings = {}) {
  return JSON.stringify(settings);
}

// Neu: Häuser aus Gladys einlesen und für die weitere Verwendung speichern.
// Die Funktion wird von index.js beim Verbindungsaufbau aufgerufen.
export async function refreshHouses(gladys) {
  try {
    const houses = await gladys.getHouses();

    // Nur eine gültige Liste übernehmen, damit wir keine ungültigen
    // Daten als aktuelle Hausliste speichern.
    if (!Array.isArray(houses)) {
      throw new Error('getHouses() hat keine gültige Hausliste geliefert.');
    }

    gladysHouses = houses;

    logger.info(
      `[Route-Test] ${gladysHouses.length} Gladys-Haus/Häuser geladen.`,
    );
  } catch (err) {
    logger.error(
      '[Route-Test] Gladys-Häuser konnten nicht geladen werden.',
      err,
    );

    throw err;
  }
}

// Konfigurationswerte für die späteren echten Routenabfragen.
function getConfiguration(settings = {}) {
  return {
    house: settings.house ?? '(nicht gesetzt)',
    latitude: settings.latitude ?? '(nicht gesetzt)',
    longitude: settings.longitude ?? '(nicht gesetzt)',
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

  return day <= new Date(year, month, 0).getDate();
}

function isValidTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hours, minutes] = value.split(':').map(Number);

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

// Drei simulierte Verbindungen für den Funktionstest.
function getRoute({ start, destination, date, time, configuration }) {
  const configText =
    `Gladys-Zuhause: ${configuration.house}\n` +
    `Breitengrad: ${configuration.latitude}\n` +
    `Längengrad: ${configuration.longitude}\n` +
    `Transitous-Kennzeichner: ${configuration.contact}\n`;

  return [
    {
      title: 'Testverbindung 1',
      subtitle: 'Abfahrt 08:15 · Ankunft 08:42',
      description:
        `Start: ${start}\nZiel: ${destination}\n` +
        `Datum: ${date}\nUhrzeit: ${time}\n\n` +
        configText +
        '\nSimulierte Verbindung ohne Umstieg.',
    },
    {
      title: 'Testverbindung 2',
      subtitle: 'Abfahrt 08:20 · Ankunft 08:55',
      description:
        `Start: ${start}\nZiel: ${destination}\n` +
        `Datum: ${date}\nUhrzeit: ${time}\n\n` +
        configText +
        '\nSimulierte Verbindung mit einem Umstieg.',
    },
    {
      title: 'Testverbindung 3',
      subtitle: 'Abfahrt 08:30 · Ankunft 09:05',
      description:
        `Start: ${start}\nZiel: ${destination}\n` +
        `Datum: ${date}\nUhrzeit: ${time}\n\n` +
        configText +
        '\nDritte simulierte Verbindung.',
    },
  ];
}

const routeFormFields = [
  {
    key: 'start',
    type: 'string',
    required: true,
    label: {
      de: 'Start',
      en: 'Departure',
      fr: 'Départ',
    },
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
  },
  {
    key: 'time',
    type: 'string',
    required: true,
    label: {
      de: 'Uhrzeit (HH:mm)',
      en: 'Time (HH:mm, 24-hour)',
      fr: 'Heure (HH:mm, 24 h)',
    },
  },
];

function createRouteButton() {
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
      fields: routeFormFields,
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

      components.push(createRouteButton());

      return {
        ttl_seconds: 3600,
        components,
      };
    },

    async action(gladys, { actionKey, settings = {}, values } = {}) {
      if (actionKey !== 'get_route') {
        return;
      }

      const requiredFields = ['start', 'destination', 'date', 'time'];

      const missingFields = requiredFields.filter(
        (key) =>
          typeof values?.[key] !== 'string' || !values[key].trim(),
      );

      if (missingFields.length > 0) {
        return {
          de: 'Bitte alle vier Formularfelder ausfüllen.',
          en: 'Please complete all four form fields.',
          fr: 'Veuillez remplir les quatre champs du formulaire.',
        };
      }

      const date = values.date.trim();
      const time = values.time.trim();

      if (!isValidDate(date)) {
        return {
          de: 'Ungültiges Datum. Bitte TT.MM.JJJJ verwenden, z. B. 20.10.2026.',
          en: 'Invalid date. Use DD.MM.YYYY, e.g. 20.10.2026.',
          fr: 'Date invalide. Utilisez JJ.MM.AAAA, par ex. 20.10.2026.',
        };
      }

      if (!isValidTime(time)) {
        return {
          de: 'Ungültige Uhrzeit. Bitte HH:mm verwenden, z. B. 08:15.',
          en: 'Invalid time. Use HH:mm, e.g. 08:15.',
          fr: 'Heure invalide. Utilisez HH:mm, par ex. 08:15.',
        };
      }

      const routes = getRoute({
        start: values.start.trim(),
        destination: values.destination.trim(),
        date,
        time,
        configuration: getConfiguration(settings),
      });

      routeResults.set(getWidgetKey(settings), routes);

      logger.info(
        `[Route-Test] ${routes.length} simulierte Verbindungen erzeugt.`,
      );

      gladys.requestWidgetRefresh(TRANSITOUS_ROUTING_WIDGET);

      return {
        de: 'Drei Testverbindungen wurden erzeugt.',
        en: 'Three test connections were generated.',
        fr: 'Trois trajets de test ont été générés.',
      };
    },
  },
};

export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
