
import { logger } from '@gladysassistant/integration-sdk';

export const TRANSITOUS_ROUTING_WIDGET = 'transitous_routing';

// Simulierte Verbindungen getrennt nach Widget-Konfiguration speichern.
const routeResults = new Map();

// Die zuletzt erfolgreich von Gladys geladenen Häuser.
// Die Liste wird beim Verbindungsaufbau in index.js aktualisiert.
let gladysHouses = [];

// Einen Schlüssel für die jeweilige Widget-Konfiguration erzeugen.
function getWidgetKey(settings = {}) {
  return JSON.stringify(settings);
}

// Häuser aus Gladys laden und im Speicher ablegen.
// Bei einem Fehler bleibt die bisherige Liste erhalten.
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

// Das konfigurierte Haus ermitteln.
// Falls es nicht mehr existiert, wird das erste verfügbare Haus verwendet.
function resolveHouse(settings = {}) {
  if (settings.house) {
    const configuredHouse = gladysHouses.find(
      (house) => house.selector === settings.house,
    );

    if (configuredHouse) {
      return configuredHouse;
    }

    logger.info(
      '[Route-Test] Konfiguriertes Haus nicht gefunden; ' +
        'verwende ein verfügbares Haus als Standard.',
    );
  }

  return gladysHouses[0] ?? null;
}

// Prüfen, ob ein Koordinatenwert vorhanden und numerisch ist.
function hasCoordinate(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== '' &&
    Number.isFinite(Number(value))
  );
}

// Hausdaten und manuelle Koordinaten zusammenführen.
// Vorhandene Hauskoordinaten haben Vorrang.
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

  // Keine konkreten Koordinaten in die Logs schreiben.
  if (selectedHouse) {
    logger.info(
      `[Route-Test] Konfiguriertes Haus: "${selectedHouse.name}". ` +
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

// Ein Datum im Format TT.MM.JJJJ prüfen.
function isValidDate(value) {
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
    return false;
  }

  const [day, month, year] = value.split('.').map(Number);

  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  // Monatslängen einschließlich Schaltjahren bestimmen.
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

// Eine Uhrzeit im Format HH:mm prüfen.
function isValidTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hours, minutes] = value.split(':').map(Number);

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

// Drei simulierte Verbindungen für den Funktionstest.
// Eine echte Transitous-Abfrage folgt später.
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

// Vier Formularfelder: Start, Ziel, Datum und Uhrzeit.
// Der Start wird aus dem konfigurierten Haus vorbelegt.
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

// Ein einzelner Button öffnet das Vier-Felder-Formular.
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
      // Bereits erzeugte Verbindungen weiterhin anzeigen.
      const savedRoutes = routeResults.get(getWidgetKey(settings));
      const components = [];

      if (savedRoutes) {
        components.push({
          type: 'card-list',
          display: 'list',
          items: savedRoutes,
        });
      }

      // Keine Haus-Buttons mehr: nur ein Startbutton.
      components.push(createRouteButton(settings));

      return {
        ttl_seconds: 60,
        components,
      };
    },

    async action(
      gladys,
      { actionKey, settings = {}, values } = {},
    ) {
      if (actionKey !== 'get_route') {
        return;
      }

      // Alle vier Formularfelder prüfen.
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

      // Datum und Uhrzeit unabhängig voneinander validieren.
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

      // Das in der Konfiguration ausgewählte Haus verwenden.
      const configuration = getConfiguration(settings);

      const routes = getRoute({
        start,
        destination,
        date,
        time,
        configuration,
      });

      routeResults.set(getWidgetKey(settings), routes);

      logger.info(
        `[Route-Test] ${routes.length} simulierte Verbindungen erzeugt.`,
      );

      return {
        de: 'Drei Testverbindungen wurden erzeugt.',
        en: 'Three test connections were generated.',
        fr: 'Trois trajets de test ont été générés.',
      };
    },
  },
};

// Widgets nach Konfigurationsänderungen oder Verbindungsaufbau aktualisieren.
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
