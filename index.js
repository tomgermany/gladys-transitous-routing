
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { WIDGETS, refreshWidgets } from './src/widgets.js';

const gladys = new GladysIntegration();

// Alle im Projekt definierten Dashboard-Widgets registrieren.
for (const [widgetKey, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(widgetKey, (request) =>
    widget.get(gladys, request ?? {}),
  );

  // Widget-Aktionen einschließlich der ausgefüllten Formularwerte registrieren.
  if (typeof widget.action === 'function') {
    gladys.onWidgetAction(
      widgetKey,
      (actionKey, params, { settings, values } = {}) =>
        widget.action(gladys, {
          actionKey,
          params,
          settings,
          values,
        }),
    );
  }
}

// Bei geänderten Integrationseinstellungen die Widgets aktualisieren.
gladys.onConfigUpdated(async () => {
  logger.info('Konfiguration aktualisiert');
  refreshWidgets(gladys);
});

// Nach erfolgreicher Verbindung den Status melden und die Widgets aktualisieren.
gladys.on('connected', async () => {
  try {
    await gladys.setConnectionStatus(true);
    refreshWidgets(gladys);
    logger.info('Integration verbunden');
  } catch (err) {
    logger.error('Initialisierung fehlgeschlagen', err);

    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        de: 'Initialisierung fehlgeschlagen. Bitte die Integrationsprotokolle prüfen.',
        fr: "L'initialisation a échoué. Consultez les journaux de l'intégration.",
      })
      .catch(() => {});
  }
});

// Die Integration bei einem Beendigungssignal sauber herunterfahren.
gladys.handleShutdown((signal) => {
  logger.info(`Integration wird beendet: ${signal}`);
});

// Verbindung zu Gladys starten.
logger.info('Starte Integration für den Routen-Funktionstest...');

gladys.connect().catch((err) => {
  logger.error('Verbindung zu Gladys fehlgeschlagen', err);
  process.exit(1);
});
