
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import {
  WIDGETS,
  refreshHouses,
  refreshWidgets,
} from './src/widgets.js';

const gladys = new GladysIntegration();

// Alle Widgets registrieren und ihre Abrufe an die jeweilige get()-Funktion leiten.
for (const [widgetKey, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(widgetKey, (request) =>
    widget.get(gladys, request ?? {}),
  );

  // Formularwerte zusammen mit actionKey, params und settings weitergeben.
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

// Änderungen an der Integrationskonfiguration aktualisieren die Widgets.
// Die Hausliste wird hier nicht regelmäßig neu geladen.
gladys.onConfigUpdated(async () => {
  logger.info('[Route-Test] Konfiguration geändert.');
  refreshWidgets(gladys);
});

// Nach erfolgreicher Verbindung die Hausliste einmal laden.
// Bei einer erneuten Verbindung wird sie ebenfalls aktualisiert.
gladys.on('connected', async () => {
  logger.info('[Route-Test] Verbindung zu Gladys hergestellt.');

  try {
    try {
      await refreshHouses(gladys);
    } catch (err) {
      // Ein Fehler beim Laden der Häuser soll die gesamte Integration
      // nicht blockieren. Die letzte erfolgreich geladene Liste bleibt erhalten.
      logger.error(
        '[Route-Test] Hausliste konnte nicht geladen werden.',
        err,
      );
    }

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
