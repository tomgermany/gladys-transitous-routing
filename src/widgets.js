```javascript
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
      de: 'Datum',
      en: 'Date',
      fr: 'Date',
    },
  },
  {
    key: 'time',
    type: 'string',
    required: true,
    label: {
      de: 'Uhrzeit',
      en: 'Time',
      fr: 'Heure',
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
            text: 'Öffne das Mini-Formular und übermittle die vier Testwerte.',
          },
          createRouteButton(),
        );
      } else {
        logger.info(
         
