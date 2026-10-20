
import { logger } from '@gladysassistant/integration-sdk';

export const TRANSITOUS_ROUTING_WIDGET = 'transitous_routing';

// Ergebnisse je Widget-Konfiguration zwischenspeichern.
const routeResults = new Map();

// Die zuletzt erfolgreich von Gladys geladene Hausliste.
let gladysHouses = [];

function getWidgetKey(settings = {}) {
  return JSON.stringify(settings);
}

// Häuser aus Gladys laden und die bisherige Liste nur bei Erfolg ersetzen.
export async function refreshHouses(gladys) {
  const houses = await gladys.getHouses();

  if (!Array.isArray(houses)) {
    throw new Error('getHouses() hat keine gültige Hausliste geliefert.');
  }

  gladysHouses = houses;

  logger.info(
    `[Route-Test] ${gladysHouses.length} Gladys-Haus/Häuser geladen.`,
  );
}

// Haus anhand des in der Konfiguration gespeicherten selectors finden.
// Falls genau ein Haus existiert und keines ausgewählt wurde,
// verwenden wir dieses Haus automatisch.
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

// Prüfen, ob ein Koordinatenwert numerisch und vorhanden ist.
function hasCoordinate(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== '' &&
    Number.isFinite(Number(value))
  );
}

// Hausdaten und manuelle Rückfallwerte zusammenführen.
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

  // Aus Datenschutzgründen protokollieren wir keine Koordinaten.
  if (selectedHouse) {
    logger.info(
      `[Route-Test] Haus erkannt: "${selectedHouse.name}". ` +
        `Breitengrad vorhanden: ${hasCoordinate(houseLatitude)}; ` +
        `Längengrad vorhanden: ${hasCoordinate(houseLongitude)}.`,
    );
  } else if (settings.house) {
    logger.info(
      '[Route-Test] Konfiguriertes Haus wurde in der geladenen Hausliste nicht gefunden.',
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

// Formular-Button erzeugen und den Hausnamen als Startwert vorbelegen.
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
      // Neu: Die Hausliste bei jedem Widget-Abruf aktualisieren.
      // So werden nachträglich angelegte Häuser ebenfalls erkannt.
      try {
        await refreshHouses(gladys);
      } catch (err) {
        // refreshHouses ersetzt die bisherige Liste nur bei Erfolg.
        // Bei einem vorübergehenden Fehler bleibt die letzte gültige
        // Hausliste verfügbar, damit das Widget weiter angezeigt wird.
        logger.error(
          '[Route-Test] Aktualisierung der Hausliste fehlgeschlagen; verwende die letzte bekannte Liste.',
          err,
        );
      }

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

      // Die Hausliste wurde beim Öffnen des Formulars aktualisiert.
      // Die Konfiguration wird hier erneut ausgewertet.
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

