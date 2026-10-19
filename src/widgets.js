
/**
 * Minimaler Funktionstest für Widget-Formulare im Gladys SDK 0.15.x.
 *
 * Testablauf:
 * 1. Der Widget-Button öffnet ein Mini-Formular.
 * 2. Gladys übergibt die Formularwerte an die Aktion get_route.
 * 3. Die Aktion erzeugt drei simulierte Verbindungen.
 * 4. Die Ergebnisse werden gespeichert und das Widget wird aktualisiert.
 * 5. Der erneute Widget-Abruf zeigt die drei Verbindungen als Cardlist.
 */

export const TRANSITOUS_DEPARTURES_WIDGET = 'transitous_departures';

// Zwischenspeicher für die Ergebnisse.
// Der Schlüssel berücksichtigt die Einstellungen der jeweiligen Widget-Instanz.
const routeResults = new Map();

/**
 * Erzeugt einen stabilen Schlüssel für eine Widget-Konfiguration.
 * So können unterschiedliche Widget-Instanzen getrennte Ergebnisse anzeigen.
 */
function getWidgetKey(settings = {}) {
  return JSON.stringify(settings);
}

/**
 * Erzeugt drei Testverbindungen anhand der übermittelten Formulardaten.
 *
 * Es werden noch keine echten Fahrplandaten abgefragt.
 * Die Eingaben dienen ausschließlich dazu, die Datenübergabe zu prüfen.
 */
function getRoute({ start, destination, date, time }) {
  return [
    {
      title: 'Testverbindung 1',
      subtitle: 'Abfahrt 08:15 · Ankunft 08:42',
      description:
        `Start: ${start}\nZiel: ${destination}\n` +
        `Datum: ${date}\nGewünschte Uhrzeit: ${time}\n` +
        'Simulierte Verbindung ohne Umstieg.',
    },
    {
      title: 'Testverbindung 2',
      subtitle: 'Abfahrt 08:20 · Ankunft 08:55',
      description:
        `Start: ${start}\nZiel: ${destination}\n` +
        `Datum: ${date}\nGewünschte Uhrzeit: ${time}\n` +
        'Simulierte Verbindung mit einem Umstieg.',
    },
    {
      title: 'Testverbindung 3',
      subtitle: 'Abfahrt 08:30 · Ankunft 09:05',
      description:
        `Start: ${start}\nZiel: ${destination}\n` +
        `Datum: ${date}\nGewünschte Uhrzeit: ${time}\n` +
        'Dritte simulierte Verbindung für den Funktionstest.',
    },
  ];
}

/**
 * Definition der Widget-Felder.
 *
 * Die Werte werden beim Antippen des Buttons in einem Formular abgefragt.
 * Das SDK unterstützt hier unter anderem den Feldtyp string.
 * Deshalb sind Datum und Uhrzeit zunächst normale Texteingaben.
 */
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

/**
 * Gemeinsamer Button zum Öffnen des Mini-Formulars.
 *
 * Die fields gehören zur action. Gladys öffnet das Formular beim Antippen
 * und übergibt die ausgefüllten Felder anschließend separat als values.
 */
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
     * Wird von Gladys beim Laden oder Aktualisieren des Widgets aufgerufen.
     */
    async get(gladys, { settings = {}, language = 'de' } = {}) {
      const savedRoutes = routeResults.get(getWidgetKey(settings));

      const heading = {
        type: 'text',
        variant: 'heading',
        text: {
          de: 'Routen-Funktionstest',
          en: 'Route function test',
          fr: 'Test de recherche d’itinéraire',
        },
      };

      // Vor dem ersten Formularversand gibt es noch keine Ergebnisse.
      if (!savedRoutes) {
        return {
          ttl_seconds: 3600,
          components: [
            heading,
            {
              type: 'text',
              variant: 'body',
              text: {
                de: 'Öffne das Mini-Formular und übermittle die vier Testwerte.',
                en: 'Open the mini form and submit the four test values.',
                fr: 'Ouvre le mini-formulaire et envoie les quatre valeurs de test.',
              },
            },
            createRouteButton(),
          ],
        };
      }

      // Nach dem Absenden werden die gespeicherten Testverbindungen angezeigt.
      return {
        ttl_seconds: 3600,
        components: [
          heading,
          {
            type: 'card-list',
            display: 'list',
            items: savedRoutes,
          },
          createRouteButton(),
        ],
      };
    },

    /**
     * Verarbeitet den Formularversand.
     *
     * values enthält die vom Benutzer eingegebenen und von Gladys
     * validierten Formularwerte. params ist davon getrennt.
     */
    async action(gladys, { actionKey, settings = {}, values } = {}) {
      if (actionKey !== 'get_route') {
        return;
      }

      // Ohne Formularwerte kann der Test nicht ausgeführt werden.
      if (
        !values
        || !values.start
        || !values.destination
        || !values.date
        || !values.time
      ) {
        return {
          de: 'Formulardaten fehlen.',
          en: 'Form values are missing.',
          fr: 'Les données du formulaire sont manquantes.',
        };
      }

      // Die drei simulierten Verbindungen anhand der Formulardaten erzeugen.
      const routes = getRoute({
        start: String(values.start).trim(),
        destination: String(values.destination).trim(),
        date: String(values.date).trim(),
        time: String(values.time).trim(),
      });

      // Die Ergebnisse müssen bis zum nächsten Widget-Abruf erhalten bleiben.
      routeResults.set(getWidgetKey(settings), routes);

      // Die Aktualisierung ausdrücklich über den SDK-Mechanismus anfordern.
      gladys.requestWidgetRefresh(TRANSITOUS_DEPARTURES_WIDGET);

      // Gladys zeigt diese Rückmeldung nach erfolgreicher Aktion als Toast an.
      return {
        de: 'Formulardaten empfangen. Drei Testverbindungen wurden erzeugt.',
        en: 'Form values received. Three test connections were generated.',
        fr: 'Données reçues. Trois trajets de test ont été générés.',
      };
    },
  },
};

/**
 * Fordert nach Verbindungsaufbau oder Konfigurationsänderungen
 * die Aktualisierung aller registrierten Widgets an.
 */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
