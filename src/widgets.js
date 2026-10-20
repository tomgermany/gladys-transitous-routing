
import { logger } from '@gladysassistant/integration-sdk';

export const TRANSITOUS_ROUTING_WIDGET = 'transitous_routing';

// Ergebnisse je Widget-Konfiguration zwischenspeichern.
const routeResults = new Map();

// Hausliste aus Gladys zwischenspeichern.
// Sie wird beim Verbindungsaufbau durch index.js aktualisiert.
let gladysHouses = [];

function getWidgetKey(settings = {}) {
  return JSON.stringify(settings);
}

// Hausliste aus Gladys einlesen.
export async function refreshHouses(gladys) {
  try {
    const houses = await gladys.getHouses();

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

// Prüfen, ob ein Koordinatenwert tatsächlich vorhanden und numerisch ist.
function hasCoordinate(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== '' &&
    Number.isFinite(Number(value))
  );
}

// Das in der Konfiguration ausgewählte Haus anhand seines selectors finden.
// Falls genau ein Haus existiert und keine Auswahl gespeichert ist,
// verwenden wir dieses eine Haus als sinnvollen Standard.
function resolveHouse(settings = {}) {
  if (settings.house) {
    return (
      gladysHouses.find((house) => house.selector === settings.house) ?? null
    );
  }

  if (gladysHouses.length === 1) {
    return gladysHouses[0];
  }

  return null;
}

// Konfiguration und Hausdaten für die spätere Routenabfrage zusammenführen.
// Hauskoordinaten haben Vorrang; manuelle Koordinaten bleiben Rückfalloption.
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

  // Datensparsame Diagnose: keine Koordinaten oder Adressen protokollieren.
  if (selectedHouse) {
    logger.info(
      `[Route-Test] Haus erkannt: "${selectedHouse.name}". ` +
        `Breitengrad vorhanden: ${hasCoordinate(houseLatitude)}; ` +
        `Längengrad vorhanden: ${hasCoordinate(houseLongitude)}.`,
    );
  } else if (settings.house) {
    logger.info(
      '[Route-Test] Das konfigurierte Haus wurde in der geladenen Hausliste nicht gefunden.',
    );
  } else {
    logger.info(
      '[Route-Test] Kein eindeutiges Haus ausgewählt; manuelle Koordinaten bleiben verfügbar.',
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
// Die echten Transitous-Abfragen werden später integriert.
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

// Den Button für die Routenabfrage erzeugen.
// Der Hausname wird als Standardwert für das Startfeld eingesetzt.
// Der Anwender kann diesen Wert im Formular weiterhin ändern.
function createRouteButton(settings = {}) {
  const selectedHouse = resolveHouse(settings);

  const fields = routeFormFields.map((field) => {
    if (field.key === 'start' && selectedHouse?.name) {
      return {
        ...field,
        default: selectedHouse.name,
      };
    }

    return field;
  });

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
      fields,
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

      // Das Formular erhält den Namen des konfigurierten Hauses als Startvorschlag.
      components.push(createRouteButton(settings));

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

      // Hausdaten und Rückfallkoordinaten für die aktuelle Anfrage auflösen.
      const configuration = getConfiguration(settings);

      const routes = getRoute({
        start: values.start.trim(),
        destination: values.destination.trim(),
        date,
        time,
        configuration,
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
