
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  TRANSITOUS_ROUTING_WIDGET,
  WIDGETS,
  refreshWidgets,
} from '../src/widgets.js';

const widget = WIDGETS[];

const getContent = (settings = {}) =>
  widget.get(createFakeGladys(), {
    settings,
    language: 'de',
    units: 'metric',
    config: {},
  });

test('the route widget is registered', () => {
  assert.ok(widget, 'transitous_routing must be registered');
  assert.equal(typeof widget.get, 'function');
  assert.equal(typeof widget.action, 'function');
});

test('initial widget content is valid and offers the route form', async () => {
  const content = await getContent();

  assert.deepEqual(validateWidgetContent(content), []);

  assert.ok(
    content.components.some(
      (component) => component.type === 'button'
        && component.action?.key === 'get_route',
    ),
    'the widget offers the route form button',
  );

  assert.ok(
    !content.components.some((component) => component.type === 'card-list'),
    'mock routes are not shown before submitting the form',
  );
});

test('widget refresh interval is set to one hour', async () => {
  const content = await getContent();

  assert.equal(content.ttl_seconds, 3600);
});

test('refreshWidgets nudges every registered widget', () => {
  const gladys = createFakeGladys();

  refreshWidgets(gladys);

  assert.deepEqual(
    gladys.fake.widgetRefreshes,
    Object.keys(WIDGETS),
  );
});
