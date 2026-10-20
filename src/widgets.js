
import { logger } from '@gladysassistant/integration-sdk';

export const TRANSITOUS_ROUTING_WIDGET = 'transitous_routing';

// Die simulierten Routen bleiben je Widget-Konfiguration gespeichert.
const routeResults = new Map();

// Die zuletzt erfolgreich von Gladys geladenen Häuser.
let gladysHouses = [];

// Vorübergehende Auswahl des Hauses, getrennt nach Widget-Konfiguration.
// Diese Auswahl verändert NICHT die gespeicherte Gladys-Konfiguration.
const selectedHouseBySettings = new Map();

// Einen stabilen Schlüssel für eine Widget-Konfiguration erzeugen.
function getWidgetKey(settings = {}) {
  return JSON.stringify(settings);
}

// Häuser beim Verbindungsaufbau laden.
export async function refreshHouses(gladys) {
  const houses = await gladys.getHouses();

  if (!Array.isArray(houses)) {
    throw new Error('getHouses() hat keine gültige Hausliste geliefert.');
  }

  gladysHouses = houses;

  // Diagnose: Namen und Selector aller geladenen Häuser vergleichen.
// Koordinaten werden absichtlich nicht protokolliert.
logger.info(
  '[Route-Test] Geladene Häuser:',
  gladysHouses.map((house) => ({
    name: house.name,
    selector: house.selector,
  })),
);

  logger.info(
    `[Route-Test] ${gladysHouses.length} Gladys-Haus/Häuser geladen.`,
  );
}

// Ein Haus anhand seines Gladys-Selectors finden.
function findHouse(selector) {
  return gladysHouses.find((house) => house.selector === selector) ?? null;
}

// Das konfigurierte Haus bevorzugen, sonst das erste verfügbare Haus.
function resolveDefaultHouse(settings = {}) {
  if (settings.house) {
    const configuredHouse = findHouse(settings.house);

    if (configuredHouse) {
      return configuredHouse;
    }
  }

  return gladysHouses[0] ?? null;
}

// Das aktuell ausgewählte Haus ermitteln.
// Bei einer noch nicht erfolgten Auswahl gilt das konfigurierte Haus
// oder ersatzweise das erste verfügbare Haus als Standard.
function getSelectedHouse(settings = {}) {
  const widgetKey = getWidgetKey(settings);
  const savedSelector = selectedHouseBySettings.get(widgetKey);

  if (savedSelector) {
    const savedHouse = findHouse(savedSelector);

    if (savedHouse) {
      return savedHouse;
    }
  }

  const defaultHouse = resolveDefaultHouse(settings);

  if (defaultHouse) {
    selectedHouseBySettings.set(widgetKey, defaultHouse.selector);
  }

  return defaultHouse;
}

// Bei mehreren Häusern höchstens drei Haus-Buttons anzeigen.
// Das ausgewählte Haus steht an erster Stelle.
function getSelectableHouses(settings = {}) {
  const selectedHouse = getSelectedHouse(settings);

  const orderedHouses = selectedHouse
    ? [
        selectedHouse,
        ...gladysHouses.filter(
          (house) => house.selector !== selectedHouse.selector,
        ),
      ]
    : gladysHouses;

  return orderedHouses.slice(0, 3);
}

// Prüfen, ob ein Wert eine gültige numerische Koordinate ist.
function hasCoordinate(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== '' &&
    Number.isFinite(Number(value))
  );
}

// Hauskoordinaten und manuelle Koordinaten zusammenführen.
// Vorhandene Hauskoordinaten haben Vorrang.
function getConfiguration(settings = {}, houseSelector = undefined) {
  const selectedHouse =
    houseSelector !== undefined
      ? findHouse(houseSelector)
      : resolveDefaultHouse(settings);

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
      `[Route-Test] Haus erkannt: "${selectedHouse.name}". ` +
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

  // Monatslängen korrekt bestimmen, auch für Jahre unter 100.
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

// Die vier erlaubten Formularfelder.
// Datum und Uhrzeit bleiben getrennt und sind einzeln editierbar.
function createRouteFields(settings = {}) {
  const selectedHouse = getSelectedHouse(settings);

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

// Haus-Buttons erzeugen.
// Der aktuell ausgewählte Button erhält den primären Stil.
function createHouseButtons(settings = {}) {
  const selectedHouse = getSelectedHouse(settings);
  const widgetKey = getWidgetKey(settings);

  return getSelectableHouses(settings).map((house) => {
    const isSelected = house.selector === selectedHouse?.selector;

    return {
      type: 'button',
      label: house.name.slice(0, 24),
      icon: 'home',
      style: isSelected ? 'primary' : 'secondary',
      action: {
        key: 'select_house',
        params: {
          houseSelector: house.selector,
        },
      },
    };
  });
}

// Der separate Startbutton öffnet das Vier-Felder-Formular.
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
      const widgetKey = getWidgetKey(settings);
      const savedRoutes = routeResults.get(widgetKey);
      const components = [];

      // Bereits erzeugte Verbindungen weiterhin anzeigen.
      if (savedRoutes) {
        components.push({
          type: 'card-list',
          display: 'list',
          items: savedRoutes,
        });
      }

      // Bis zu drei Haus-Buttons und ein separater Startbutton.
      components.push(...createHouseButtons(settings));
      components.push(createRouteButton(settings));

      return {
        ttl_seconds: 60,
        components,
      };
    },

    async action(
      gladys,
      { actionKey, params = {}, settings = {}, values } = {},
    ) {
      const widgetKey = getWidgetKey(settings);

      // Einen Haus-Button gedrückt: Auswahl speichern und Widget erneuern.
      if (actionKey === 'select_house') {
        const house = findHouse(params.houseSelector);

        if (!house) {
          return {
            de: 'Dieses Haus ist nicht mehr verfügbar.',
            en: 'This house is no longer available.',
            fr: 'Ce domicile n’est plus disponible.',
          };
        }

        selectedHouseBySettings.set(widgetKey, house.selector);

        logger.info(
          `[Route-Test] Haus für die nächste Anfrage ausgewählt: "${house.name}".`,
        );

        // Die SDK-Aktion verwirft den Widget-Cache nach der Rückgabe.
        // Dadurch wird der ausgewählte Button beim nächsten Abruf markiert.
        return {
          de: `Haus ausgewählt: ${house.name}`,
          en: `House selected: ${house.name}`,
          fr: `Domicile sélectionné : ${house.name}`,
        };
      }

      if (actionKey !== 'get_route') {
        return;
      }

      // Alle vier Formularfelder prüfen.
      const requiredFields = ['start', 'destination', 'date', 'time'];

      const missingFields = requiredFields.filter((key) => {
        const value = values?.[key];

        return (
          typeof value !== 'string' ||
          value.trim() === ''
        );
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

      // Die zuvor gewählte Hausauswahl für diese Anfrage verwenden.
      const selectedHouse = getSelectedHouse(settings);

      const configuration = getConfiguration(
        settings,
        selectedHouse?.selector,
      );

      const routes = getRoute({
        start,
        destination,
        date,
        time,
        configuration,
      });

      routeResults.set(widgetKey, routes);

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

// Alle Widgets nach Konfigurationsänderungen oder Verbindungsaufbau
// zur Aktualisierung auffordern.
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
