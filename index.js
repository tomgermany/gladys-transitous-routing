
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { WIDGETS, refreshWidgets } from './src/widgets.js';

const gladys = new GladysIntegration();

// Alle Widgets registrieren und ihre Abrufe an die jeweilige get()-Funktion leiten.
for (const [widgetKey, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(widgetKey, (request) =>
    widget.get(gladys, request ?? {}),
  );

  // Formularwerte müssen zusätzlich zu actionKey, params und settings
  // an die Widget-Aktion weitergegeben werden.
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

    logger.info(`[Route-Test] Widget-Aktionen registriert: ${widgetKey}.`);
  }
}

// Änderungen an der Konfiguration lösen eine Widget-Aktualisierung aus.
gladys.onConfigUpdated(async () => {
  logger.info('[Route-Test] Konfiguration geändert.');
  refreshWidgets(gladys);
});

// Nach erfolgreicher Verbindung den Status setzen und das Widget aktualisieren.
gladys.on('connected', async () => {
  logger.info('[Route-Test] Verbindung zu Gladys hergestellt.');

  try {
    await gladys.setConnectionStatus(true);
    refreshWidgets(gladys);
    logger.info('[Route-Test] Initialisierung abgeschlossen.');
  } catch (err) {
    logger.error('[Route-Test] Initialisierung fehlgeschlagen.', err);

    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        de: 'Initialisierung fehlgeschlagen. Bitte die Integrationsprotokolle prüfen.',
        fr: "L'initialisation a échoué. Consultez les journaux de l'intégration.",
      })
      .catch(() => {});
  }
});

// Sauberes Beenden der Integration protokollieren.
gladys.handleShutdown((signal) => {
  logger.info(`[Route-Test] Integration wird beendet: ${signal}.`);
});

// Integration starten.
logger.info('[Route-Test] Starte Integration.');

gladys.connect().catch((err) => {
  logger.error('[Route-Test] Verbindung zu Gladys fehlgeschlagen.', err);
  process.exit(1);
});
