
import { logger } from '@gladysassistant/integration-sdk';

export const TRANSITOUS_ROUTING_WIDGET = 'transitous_routing';

// Ergebnisse getrennt nach Widget-Konfiguration zwischenspeichern.
const routeResults = new Map();

// Die zuletzt erfolgreich geladene Hausliste.
// Sie wird beim Verbindungsaufbau in index.js aktualisiert.
let gladysHouses = [];

// Einen Schlüssel für die jeweilige Widget-Konfiguration erzeugen.
function getWidgetKey(settings = {}) {
  return JSON.stringify(settings);
}

// Häuser aus Gladys laden und im Speicher ablegen.
// Diese Funktion wird beim Verbindungsaufbau aufgerufen, nicht bei jedem
// Widget-Abruf. Bei einem Fehler bleibt die bisherige Liste erhalten.
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

// Ein Haus eindeutig auflösen.
// Eine ausdrücklich übergebene Formularauswahl hat Vorrang.
// Ist die gespeicherte Konfiguration veraltet, wird ein verfügbares Haus
// als Standard verwendet.
function resolveHouse(settings = {}, houseSelector = undefined) {
  // Eine explizite Auswahl muss exakt in der geladenen Hausliste vorkommen.
  if (houseSelector !== undefined) {
    return (
      gladysHouses.find((house) => house.selector === houseSelector) ?? null
    );
  }

  // Zuerst das konfigurierte Haus suchen.
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

  // Ohne gültige Konfiguration das erste verfügbare Haus verwenden.
  return gladysHouses[0] ?? null;
}

// Dieselbe Auflösungslogik für Standardwert und Anfrage verwenden.
function resolveDefaultHouse(settings = {}) {
  return resolveHouse(settings);
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
// Bei mehreren Häusern wird houseSelector explizit übergeben.
function getConfiguration(settings = {}, houseSelector = undefined) {
  const selectedHouse = resolveHouse(settings, houseSelector);

  const houseLatitude = selectedHouse?.latitude;
  const houseLongitude = selectedHouse?.longitude;

  // Vorhandene Hauskoordinaten haben Vorrang.
  // Manuelle Koordinaten bleiben der Rückfallwert.
  const latitude = hasCoordinate(houseLatitude)
    ? houseLatitude
    : settings.latitude;

  const longitude = hasCoordinate(houseLongitude)
    ? houseLongitude
    : settings.longitude;

  // Keine tatsächlichen Koordinaten in die Logs schreiben.
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

  // Der letzte Tag des Monats berücksichtigt auch Schaltjahre.
  return day <= new Date(year, month, 0).getDate();
}

// Eine Uhrzeit im Format HH:mm prüfen.
function isValidTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hours, minutes] = value.split(':').map(Number);

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

// Datum und Uhrzeit aus dem gemeinsamen Feld lesen und getrennt validieren.
// Erwartetes Format: TT.MM.JJJJ HH:mm
function parseDateTime(value) {
  const match = /^(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [, date, time] = match;

  if (!isValidDate(date) || !isValidTime(time)) {
    return null;
  }

  return { date, time };
}

// Drei simulierte Verbindungen für den Funktionstest.
// Die echte Transitous-Abfrage wird später separat ergänzt.
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

// Drei Grundfelder für die Fahrplanauskunft.
// Datum und Uhrzeit teilen sich ein Feld, damit bei mehreren Häusern
// ein viertes Feld für die Hausauswahl verfügbar ist.
const baseRouteFormFields = [
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
    key: 'date_time',
    type: 'string',
    required: true,
    label: {
      de: 'Datum und Uhrzeit (TT.MM.JJJJ HH:mm)',
      en: 'Date and time (DD.MM.YYYY HH:mm)',
      fr: 'Date et heure (JJ.MM.AAAA HH:mm)',
    },
    default: `${new Date().toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })} 08:15`,
  },
];

// Die Formularfelder anhand der zuletzt geladenen Hausliste erstellen.
// Die Hausliste wird hier nicht erneut aus Gladys abgerufen.
function createRouteFields(settings = {}) {
  const defaultHouse = resolveDefaultHouse(settings);

  const fields = baseRouteFormFields.map((field) => {
    if (field.key === 'start' && defaultHouse?.name) {
      return {
        ...field,
        // Das Haus ist ein Vorschlag. Der Start bleibt editierbar.
        default: defaultHouse.name,
      };
    }

    return field;
  });

  // Nur bei mehreren Häusern eine Auswahl ergänzen.
  if (gladysHouses.length > 1) {
    fields.push({
      key: 'house',
      type: 'select',
      required: true,
      label: {
        de: 'Gladys-Zuhause',
        en: 'Gladys home',
        fr: 'Domicile Gladys',
      },

      // Statische Optionen aus dem gespeicherten Hausbestand.
      options: gladysHouses.map((house) => ({
        label: {
          de: house.name,
          en: house.name,
          fr: house.name,
        },
        value: house.selector,
      })),

      // Das konfigurierte Haus bevorzugen; sonst das erste verfügbare.
      default: defaultHouse?.selector,
    });
  }

  return fields;
}

// Den Button und sein dynamisch aufgebautes Formular erzeugen.
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
      // Nur den bereits geladenen Hausbestand verwenden.
      // refreshHouses() wird beim Verbindungsaufbau in index.js aufgerufen.
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
        // Moderater Cache für Widget-Inhalte; keine Hausabfrage im Handler.
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

      // Die Aktion verwendet dieselbe Hausliste wie das Widget.
      // Bei einer Hausänderung während des laufenden Betriebs wird die
      // neue Liste erst nach einem Neustart oder Wiederverbinden geladen.
      const requiredFields = ['start', 'destination', 'date_time'];

      if (gladysHouses.length > 1) {
        requiredFields.push('house');
      }

      const missingFields = requiredFields.filter((key) => {
        const value = values?.[key];

        return (
          (typeof value !== 'string' && typeof value !== 'number') ||
          String(value).trim() === ''
        );
      });

      if (missingFields.length > 0) {
        return {
          de: 'Bitte alle erforderlichen Formularfelder ausfüllen.',
          en: 'Please complete all required form fields.',
          fr: 'Veuillez remplir tous les champs obligatoires.',
        };
      }

      const originalStart = String(values.start).trim();
      const destination = String(values.destination).trim();
      const dateTime = String(values.date_time).trim();

      // Datum und Uhrzeit trotz gemeinsamem Feld getrennt validieren.
      const parsedDateTime = parseDateTime(dateTime);

      if (!parsedDateTime) {
        return {
          de:
            'Ungültiges Datum oder ungültige Uhrzeit. ' +
            'Bitte TT.MM.JJJJ HH:mm verwenden, z. B. 20.10.2026 08:15.',
          en:
            'Invalid date or time. Use DD.MM.YYYY HH:mm, ' +
            'e.g. 20.10.2026 08:15.',
          fr:
            'Date ou heure invalide. Utilisez JJ.MM.AAAA HH:mm, ' +
            'par ex. 20.10.2026 08:15.',
        };
      }

      // Bei mehreren Häusern die explizite Formularauswahl verwenden.
      const selectedHouseSelector =
        gladysHouses.length > 1 ? String(values.house) : undefined;

      // Veraltete Formularauswahlen sicher abfangen.
      if (
        selectedHouseSelector !== undefined &&
        !gladysHouses.some(
          (house) => house.selector === selectedHouseSelector,
        )
      ) {
        return {
          de:
            'Die Hausauswahl ist nicht mehr aktuell. ' +
            'Bitte das Widget nach einem Neustart oder einer erneuten ' +
            'Verbindung nochmals öffnen.',
          en:
            'The house selection is outdated. Please reopen the widget ' +
            'after restarting or reconnecting the integration.',
          fr:
            'Le choix du domicile n’est plus à jour. Veuillez rouvrir ' +
            'le widget après un redémarrage ou une reconnexion.',
        };
      }

      const selectedHouse = resolveHouse(
        settings,
        selectedHouseSelector,
      );

      const defaultHouse = resolveDefaultHouse(settings);

      const configuration = getConfiguration(
        settings,
        selectedHouseSelector,
      );

      // Folgt der Start noch dem vorgeschlagenen Hausnamen, wird er an die
      // Formularauswahl angepasst. Ein manuell geänderter Start bleibt stehen.
      const start =
        selectedHouse?.name &&
        defaultHouse?.name &&
        originalStart === defaultHouse.name
          ? selectedHouse.name
          : originalStart;

      const routes = getRoute({
        start,
        destination,
        date: parsedDateTime.date,
        time: parsedDateTime.time,
        configuration,
      });

      routeResults.set(getWidgetKey(settings), routes);

      logger.info(
        `[Route-Test] ${routes.length} simulierte Verbindungen erzeugt.`,
      );

      // Gladys aktualisiert den Widget-Inhalt nach der Aktion automatisch.
      return {
        de: 'Drei Testverbindungen wurden erzeugt.',
        en: 'Three test connections were generated.',
        fr: 'Trois trajets de test ont été générés.',
      };
    },
  },
};

// Alle Widgets bei Konfigurationsänderungen oder Verbindungsaufbau
// zur Aktualisierung auffordern.
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
