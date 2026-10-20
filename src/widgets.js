
import { logger } from '@gladysassistant/integration-sdk';

export const TRANSITOUS_ROUTING_WIDGET = 'transitous_routing';

// Ergebnisse je Widget-Konfiguration zwischenspeichern.
const routeResults = new Map();

// Die zuletzt erfolgreich von Gladys geladene Hausliste.
let gladysHouses = [];

// Eine stabile Kennung für die jeweilige Widget-Konfiguration erzeugen.
function getWidgetKey(settings = {}) {
  return JSON.stringify(settings);
}

// Häuser aus Gladys laden.
// Bei einem Fehler bleibt die letzte erfolgreich geladene Liste erhalten.
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

// Ein Haus anhand seines Gladys-selectors finden.
// Bei mehreren Häusern wird ohne Auswahl kein Haus stillschweigend angenommen.
function resolveHouse(settings = {}, houseSelector = undefined) {
  // Eine ausdrücklich im Formular gewählte Hauskennung hat Vorrang.
  if (houseSelector !== undefined && houseSelector !== null) {
    return (
      gladysHouses.find((house) => house.selector === houseSelector) ?? null
    );
  }

  // Anschließend die dauerhafte Widget-Konfiguration berücksichtigen.
  if (settings.house) {
    return (
      gladysHouses.find((house) => house.selector === settings.house) ?? null
    );
  }

  // Ohne Konfiguration lässt sich ein einzelnes Haus eindeutig zuordnen.
  if (gladysHouses.length === 1) {
    return gladysHouses[0];
  }

  return null;
}

// Standardhaus für das Formular ermitteln.
// Bei mehreren Häusern ist das konfigurierte Haus bevorzugt;
// fehlt es oder ist es nicht mehr vorhanden, wird das erste Haus angeboten.
function resolveDefaultHouse(settings = {}) {
  const configuredHouse = resolveHouse(settings);

  if (configuredHouse) {
    return configuredHouse;
  }

  if (gladysHouses.length > 0) {
    return gladysHouses[0];
  }

  return null;
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

// Hausdaten und manuelle Rückfallwerte zusammenführen.
// houseSelector wird bei einer Auswahl im Formular übergeben.
function getConfiguration(settings = {}, houseSelector = undefined) {
  const selectedHouse = resolveHouse(settings, houseSelector);

  const houseLatitude = selectedHouse?.latitude;
  const houseLongitude = selectedHouse?.longitude;

  // Vorhandene Hauskoordinaten haben Vorrang vor manuellen Werten.
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
  } else if (settings.house || houseSelector !== undefined) {
    logger.info(
      '[Route-Test] Gewähltes oder konfiguriertes Haus wurde nicht gefunden.',
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

  return day <= new Date(year, month, 0).getDate();
}

// Eine Uhrzeit im 24-Stunden-Format HH:mm prüfen.
function isValidTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hours, minutes] = value.split(':').map(Number);

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

// Das kombinierte Eingabefeld in Datum und Uhrzeit zerlegen.
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
// Diese Funktion bleibt bis zur späteren Transitous-Anbindung unverändert.
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

// Die drei immer vorhandenen Formularfelder.
// Datum und Uhrzeit belegen jetzt gemeinsam nur noch ein Feld.
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
  },
];

// Die Formularfelder abhängig von der Zahl der vorhandenen Häuser erstellen.
// Bei genau einem Haus ist kein Auswahlfeld erforderlich.
// Bei mehreren Häusern wird ein viertes Feld für die Hausauswahl ergänzt.
function createRouteFields(settings = {}) {
  const defaultHouse = resolveDefaultHouse(settings);

  const fields = baseRouteFormFields.map((field) => {
    if (field.key === 'start' && defaultHouse?.name) {
      return {
        ...field,
        // Das Haus ist ein Vorschlag, der Start bleibt frei editierbar.
        default: defaultHouse.name,
      };
    }

    if (field.key === 'date_time') {
      return {
        ...field,
        // Das aktuelle lokale Datum und eine Beispieluhrzeit dienen
        // als Eingabevorschlag. Die eigentliche Validierung bleibt separat.
        default: `${new Date().toLocaleDateString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })} 08:15`,
      };
    }

    return field;
  });

  if (gladysHouses.length > 1) {
    // Die Hausauswahl verwendet statische Optionen aus der aktuellen
    // Hausliste. "source: houses" ist für dieses Aktionsformular nicht
    // zulässig; deshalb werden label und selector hier selbst angegeben.
    fields.push({
      key: 'house',
      type: 'select',
      required: true,
      label: {
        de: 'Gladys-Zuhause',
        en: 'Gladys home',
        fr: 'Domicile Gladys',
      },
      options: gladysHouses.map((house) => ({
        label: {
          de: house.name,
          en: house.name,
          fr: house.name,
        },
        value: house.selector,
      })),
      // Die konfigurierte Hausauswahl ist bevorzugt.
      // Falls sie nicht mehr existiert, wird das erste Haus vorausgewählt.
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
      // Die Hausliste bei jedem Widget-Abruf aktualisieren.
      // So werden nachträglich angelegte oder geänderte Häuser erkannt.
      try {
        await refreshHouses(gladys);
      } catch (err) {
        // Bei einem vorübergehenden Fehler bleibt die letzte gültige
        // Hausliste erhalten und das Widget kann weiter angezeigt werden.
        logger.error(
          '[Route-Test] Aktualisierung der Hausliste fehlgeschlagen; ' +
            'verwende die letzte bekannte Liste.',
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

    async action(
      gladys,
      { actionKey, settings = {}, values } = {},
    ) {
      if (actionKey !== 'get_route') {
        return;
      }

      // Vor der Verarbeitung erneut versuchen, die aktuelle Hausliste
      // zu laden. Schlägt das fehl, bleibt die letzte Liste erhalten.
      try {
        await refreshHouses(gladys);
      } catch (err) {
        logger.error(
          '[Route-Test] Hausliste vor der Anfrage konnte nicht ' +
            'aktualisiert werden; verwende die letzte bekannte Liste.',
          err,
        );
      }

      const requiredFields = ['start', 'destination', 'date_time'];

      // Bei mehreren Häusern ist die Hausauswahl ein Pflichtfeld.
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

      // Datum und Uhrzeit getrennt prüfen, obwohl sie gemeinsam
      // eingegeben werden. Beide bisherigen Validierungen bleiben erhalten.
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

      // Wenn mehrere Häuser existieren, gilt die Auswahl aus dem Formular.
      // Bei einem Haus wird die bisherige Konfiguration verwendet.
      const selectedHouseSelector =
        gladysHouses.length > 1 ? String(values.house) : undefined;

      const configuration = getConfiguration(
        settings,
        selectedHouseSelector,
      );

      // Wurde ein anderes Haus gewählt und der Start nicht manuell geändert,
      // übernehmen wir den neuen Hausnamen als Start.
      // Ein frei eingetragener Startort bleibt unverändert.
      const selectedHouse = resolveHouse(settings, selectedHouseSelector);
      const defaultHouse = resolveDefaultHouse(settings);

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

      gladys.requestWidgetRefresh(TRANSITOUS_ROUTING_WIDGET);

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
