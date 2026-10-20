import { logger } from '@gladysassistant/integration-sdk';

export const TRANSITOUS_DEPARTURES_WIDGET = 'transitous_departures';

// Zwischenspeicher für Ergebnisse je Widget-Konfiguration.
const routeResults = new Map();

function getWidgetKey(settings = {}) {
  return JSON.stringify(settings);
}

// Konfigurationswerte für die Anzeige aufbereiten.
function getConfiguration(settings = {}) {
  return {
    house: settings.house ?? '(nicht gesetzt)',
    latitude: settings.latitude ?? '(nicht gesetzt)',
    longitude: settings.longitude ?? '(nicht gesetzt)',
    contact: settings.contact ?? '(nicht gesetzt)',
  };
}

// Prüft Datum im europäischen Format DD-MM-YYYY.
// Berücksichtigt auch ungültige Kalendertage und Schaltjahre.
function isValidDate(value) {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(value)) {
    return false;
  }

  const [day, month, year] = value.split('-').map(Number);

  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  const daysInMonth = new Date(year, month, 0).getDate();

  return day <= daysInMonth;
}

// Prüft die Uhrzeit im 24-Stunden-Format HH:mm.
function isValidTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hours, minutes] = value.split(':').map(Number);

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

/**
 * Erzeugt drei simulierte Verbindungen.
 * Formular- und Konfigurationsdaten werden angezeigt,
 * damit die Datenübergabe überprüft werden kann.
 */
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

// Felder für das Mini-Formular des Route-Buttons.
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
      de: 'Datum (TT-MM-JJJJ)',
      en: 'Date (DD-MM-YYYY)',
      fr: 'Date (JJ-MM-AAAA)',
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

// Der Button öffnet das Formular und startet danach get_route.
function createRouteButton() {
  return {
    type: 'button',
    label: {
      de: 'Route testen',
      en: 'Test route',
      fr: 'Tester un trajet',
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
  [TRANSITOUS_DEPARTURES_WIDGET]: {
    /**
     * Gladys ruft get() beim Laden und Aktualisieren des Widgets auf.
     */
    async get(gladys, { settings = {} } = {}) {
      const widgetKey = getWidgetKey(settings);
      const savedRoutes = routeResults.get(widgetKey);
      const configuration = getConfiguration(settings);

      logger.info(
        `[Route-Test] Widget abgerufen. Ergebnisse vorhanden: ${Boolean(savedRoutes)}.`,
      );

      const components = [
        {
          type: 'text',
          variant: 'heading',
          text: 'Routen-Funktionstest',
        },
        {
          type: 'text',
          variant: 'body',
          text:
            `Gladys-Zuhause: ${configuration.house}\n` +
            `Breitengrad: ${configuration.latitude}\n` +
            `Längengrad: ${configuration.longitude}\n` +
            `Transitous-Kennzeichner: ${configuration.contact}`,
        },
      ];

      if (!savedRoutes) {
        components.push(
          {
            type: 'text',
            variant: 'body',
            text:
              'Datum bitte als TT-MM-JJJJ und Uhrzeit als HH:mm eingeben.',
          },
          createRouteButton(),
        );
      } else {
        logger.info(
          `[Route-Test] ${savedRoutes.length} gespeicherte Testverbindungen werden angezeigt.`,
        );

        components.push(
          {
            type: 'card-list',
            display: 'list',
            items: savedRoutes,
          },
          createRouteButton(),
        );
      }

      return {
        ttl_seconds: 3600,
        components,
      };
    },

    /**
     * Verarbeitet den Formularversand.
     * values enthält die Formularwerte.
     */
    async action(gladys, { actionKey, settings = {}, values } = {}) {
      logger.info(`[Route-Test] Widget-Aktion empfangen: ${actionKey}.`);

      if (actionKey !== 'get_route') {
        logger.info('[Route-Test] Unbekannte Aktion – keine Verarbeitung.');
        return;
      }

      const requiredFields = [
        'start',
        'destination',
        'date',
        'time',
      ];

      const missingFields = requiredFields.filter(
        (key) =>
          typeof values?.[key] !== 'string' ||
          !values[key].trim(),
      );

      if (missingFields.length > 0) {
        logger.warn(
          `[Route-Test] Formular unvollständig. Fehlende Felder: ${missingFields.join(', ')}.`,
        );

        return {
          de: 'Bitte alle vier Formularfelder ausfüllen.',
          en: 'Please complete all four form fields.',
          fr: 'Veuillez remplir les quatre champs du formulaire.',
        };
      }

      const date = values.date.trim();
      const time = values.time.trim();

      if (!isValidDate(date)) {
        logger.warn('[Route-Test] Datum ungültig oder falsches Format.');

        return {
          de: 'Ungültiges Datum. Bitte TT-MM-JJJJ verwenden, z. B. 20-10-2026.',
          en: 'Invalid date. Use DD-MM-YYYY, e.g. 20-10-2026.',
          fr: 'Date invalide. Utilisez JJ-MM-AAAA, par ex. 20-10-2026.',
        };
      }

      if (!isValidTime(time)) {
        logger.warn('[Route-Test] Uhrzeit ungültig oder falsches Format.');

        return {
          de: 'Ungültige Uhrzeit. Bitte HH:mm verwenden, z. B. 08:15.',
          en: 'Invalid time. Use HH:mm, e.g. 08:15.',
          fr: 'Heure invalide. Utilisez HH:mm, par ex. 08:15.',
        };
      }

      logger.info('[Route-Test] Formularfelder erfolgreich geprüft.');

      const configuration = getConfiguration(settings);

      const routes = getRoute({
        start: values.start.trim(),
        destination: values.destination.trim(),
        date,
        time,
        configuration,
      });

      logger.info(
        `[Route-Test] ${routes.length} simulierte Verbindungen erzeugt.`,
      );

      routeResults.set(getWidgetKey(settings), routes);

      logger.info('[Route-Test] Testergebnisse im Zwischenspeicher abgelegt.');

      gladys.requestWidgetRefresh(TRANSITOUS_DEPARTURES_WIDGET);

      logger.info('[Route-Test] Widget-Aktualisierung angefordert.');

      return {
        de: 'Formulardaten empfangen. Drei Testverbindungen wurden erzeugt.',
        en: 'Form values received. Three test connections were generated.',
        fr: 'Données reçues. Trois trajets de test ont été générés.',
      };
    },
  },
};

/**
 * Aktualisiert alle registrierten Widgets, etwa nach dem Verbindungsaufbau.
 */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    logger.info(`[Route-Test] Aktualisierung angefordert: ${key}.`);
    gladys.requestWidgetRefresh(key);
  }
}
