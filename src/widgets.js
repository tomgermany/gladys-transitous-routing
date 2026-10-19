
import { logger } from '@gladysassistant/integration-sdk';

export const TRANSITOUS_DEPARTURES_WIDGET = 'transitous_departures';

// Zwischenspeicher für Ergebnisse je Widget-Konfiguration.
const routeResults = new Map();

function getWidgetKey(settings = {}) {
  return JSON.stringify(settings);
}

/**
 * Erzeugt drei simulierte Verbindungen.
 * Die Formulardaten werden in den Beschreibungen wiedergegeben,
 * damit die Datenübergabe im Widget überprüft werden kann.
 */
function getRoute({ start, destination, date, time }) {
  return [
    {
      title: 'Testverbindung 1',
      subtitle: 'Abfahrt 08:15 · Ankunft 08:42',
      description:
        `Start: ${start}\nZiel: ${destination}\n` +
        `Datum: ${date}\nUhrzeit: ${time}\n` +
        'Simulierte Verbindung ohne Umstieg.',
    },
    {
      title: 'Testverbindung 2',
      subtitle: 'Abfahrt 08:20 · Ankunft 08:55',
      description:
        `Start: ${start}\nZiel: ${destination}\n` +
        `Datum: ${date}\nUhrzeit: ${time}\n` +
        'Simulierte Verbindung mit einem Umstieg.',
    },
    {
      title: 'Testverbindung 3',
      subtitle: 'Abfahrt 08:30 · Ankunft 09:05',
      description:
        `Start: ${start}\nZiel: ${destination}\n` +
        `Datum: ${date}\nUhrzeit: ${time}\n` +
        'Dritte simulierte Verbindung.',
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

      logger.info(
        `[Route-Test] Widget abgerufen. Ergebnisse vorhanden: ${Boolean(savedRoutes)}.`,
      );

      const components = [
        {
          type: 'text',
          variant: 'heading',
          text: 'Routen-Funktionstest',
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
     * values enthält die Formularwerte, params ist ein separates Argument.
     */
    async action(gladys, { actionKey, settings = {}, values } = {}) {
      logger.info(`[Route-Test] Widget-Aktion empfangen: ${actionKey}.`);

      if (actionKey !== 'get_route') {
        logger.info('[Route-Test] Unbekannte Aktion – keine Verarbeitung.');
        return;
      }

      // Nur prüfen, ob die Pflichtfelder vorhanden sind.
      // Die eingegebenen Werte selbst werden nicht protokolliert.
      const requiredFields = [
        'start',
        'destination',
        'date',
        'time',
      ];

      const missingFields = requiredFields.filter(
        (key) =>
          typeof values?.[key] !== 'string'
          || !values[key].trim(),
      );

      if (missingFields.length > 0) {
        logger.warn(
          `[Route-Test] Formular unvollständig. Fehlende Felder: ${missingFields.join(', ')}.`,
        );

        return {
          de: 'Formulardaten fehlen.',
          en: 'Form values are missing.',
          fr: 'Les données du formulaire sont manquantes.',
        };
      }

      logger.info(
        '[Route-Test] Alle vier Formularfelder wurden empfangen.',
      );

      // Drei feste Testverbindungen anhand der Formulardaten erzeugen.
      const routes = getRoute({
        start: values.start.trim(),
        destination: values.destination.trim(),
        date: values.date.trim(),
        time: values.time.trim(),
      });

      logger.info(
        `[Route-Test] ${routes.length} simulierte Verbindungen erzeugt.`,
      );

      // Ergebnisse für den nächsten Widget-Abruf zwischenspeichern.
      routeResults.set(getWidgetKey(settings), routes);

      logger.info('[Route-Test] Testergebnisse im Zwischenspeicher abgelegt.');

      // Gladys auffordern, das Widget erneut abzurufen.
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
