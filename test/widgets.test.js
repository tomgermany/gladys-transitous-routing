import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { TRANSITOUS_DEPARTURES_WIDGET, WIDGETS, refreshWidgets } from '../src/widgets.js';

const gladys = createFakeGladys();
const widget = WIDGETS[TRANSITOUS_DEPARTURES_WIDGET];

const getContent = (settings = {}) =>
  widget.get(gladys, {
    settings,
    language: 'de',
    units: 'metric',
    config: {},
  });

test('the Transitous widget is registered', () => {
  assert.ok(widget, 'transitous_departures must be registered');
  assert.equal(typeof widget.get, 'function');
});

test('missing coordinates produce a helpful message', async () => {
  const content = await getContent();

  assert.deepEqual(validateWidgetContent(content), []);
  assert.ok(
    content.components.some((component) => component.text?.includes('Breitengrad und Längengrad')),
    'the user is asked to enter coordinates',
  );
  assert.ok(
    !content.components.some((component) => component.type === 'card-list'),
    'no departure list is shown without coordinates',
  );
});

test('invalid coordinates are rejected without fetching departures', async () => {
  for (const settings of [
    { latitude: '', longitude: '8.69' },
    { latitude: '91', longitude: '8.69' },
    { latitude: '49.35', longitude: '-181' },
    { latitude: 'not-a-number', longitude: '8.69' },
  ]) {
    const content = await getContent(settings);

    assert.ok(
      content.components.some((component) =>
        component.text?.includes('Breitengrad und Längengrad'),
      ),
      `invalid coordinates should be rejected: ${JSON.stringify(settings)}`,
    );
    assert.ok(!content.components.some((component) => component.type === 'card-list'));
  }
});

test('widget refresh interval stays within the supported limits', async () => {
  const tooShort = await getContent({
    refresh_minutes: 1,
  });
  const tooLong = await getContent({
    refresh_minutes: 120,
  });

  assert.equal(tooShort.ttl_seconds, 600);
  assert.equal(tooLong.ttl_seconds, 3600);
});

test('refreshWidgets nudges every registered widget', () => {
  const fresh = createFakeGladys();

  refreshWidgets(fresh);

  assert.deepEqual(fresh.fake.widgetRefreshes, Object.keys(WIDGETS));
});
