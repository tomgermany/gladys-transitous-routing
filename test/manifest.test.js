// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// These tests keep the manifest and the Transitous integration in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WIDGETS } from '../src/widgets.js';
import { DEFAULT_CONFIG } from '../src/config.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare.
const allFields = [
  ...(manifest.config_schema ?? []),
  ...(manifest.contact_schema ?? []),
  ...(manifest.actions ?? []).flatMap((item) => item.fields ?? []),
  ...(manifest.scene_triggers ?? []).flatMap((item) => item.fields ?? []),
  ...(manifest.scene_actions ?? []).flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// Manifest fields older Gladys releases reject as unknown.
const CAPABILITY_FIELDS = ['widgets'];
const CAPABILITY_MIN_GLADYS_VERSION = [5, 1, 0];
const CATEGORIES_MIN_GLADYS_VERSION = [4, 86, 0];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

// Minimum version of the manifest `gladys_version` range, e.g. [5, 1, 0].
function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('declaring catalog categories requires Gladys >= 4.86.0', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(
    isAtLeast(minGladysVersion(), CATEGORIES_MIN_GLADYS_VERSION),
    `categories requires gladys_version >= 4.86.0, got "${manifest.gladys_version}"`,
  );
});

test('declaring widgets requires Gladys >= 5.1.0', () => {
  const declared = CAPABILITY_FIELDS.filter((field) => manifest[field] !== undefined);
  assert.ok(declared.length > 0, 'the integration must declare its widget capability');
  assert.ok(
    isAtLeast(minGladysVersion(), CAPABILITY_MIN_GLADYS_VERSION),
    `${declared.join(', ')} requires gladys_version >= 5.1.0, got "${manifest.gladys_version}"`,
  );
});

test('every widgets key has an onWidgetGet handler, and vice versa', () => {
  const declared = keysOf(manifest.widgets);

  for (const key of declared) {
    assert.equal(typeof WIDGETS[key]?.get, 'function', `widget "${key}" has no content handler`);
  }

  for (const key of Object.keys(WIDGETS)) {
    assert.ok(declared.includes(key), `widget "${key}" is not declared in widgets`);
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(
        DEFAULT_CONFIG[field.key],
        field.default,
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((field) => field.type === 'section');

  for (const section of sections) {
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(
      section.placeholder,
      undefined,
      `section "${section.key}" must not have a placeholder`,
    );
    assert.ok(section.label?.en, `section "${section.key}" needs an English label`);
    assert.ok(
      !(section.key in DEFAULT_CONFIG),
      `section "${section.key}" must not appear in DEFAULT_CONFIG`,
    );

    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('the Transitous departure count uses valid static options', () => {
  const countField = allFields.find((field) => field.key === 'count');

  assert.ok(countField, 'the count setting must exist');
  assert.equal(countField.type, 'select');
  assert.equal(countField.source, undefined);
  assert.deepEqual(
    countField.options.map((option) => option.value),
    ['3', '6'],
  );
  assert.equal(countField.default, '6');
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image must be tagged :${manifest.version}, got "${manifest.docker_image}"`,
  );
});

test('the catalog description holds 10 to 100 characters per language', () => {
  assert.ok(manifest.description.en, 'the description needs an English text');

  for (const [lang, description] of Object.entries(manifest.description)) {
    assert.ok(
      description.length >= 10 && description.length <= 100,
      `description.${lang} has ${description.length} characters (10 to 100 allowed)`,
    );
  }
});

test('field placeholders are multi-language objects', () => {
  const withPlaceholder = allFields.filter((field) => field.placeholder !== undefined);

  assert.ok(withPlaceholder.length > 0, 'at least one field must demonstrate a placeholder');

  for (const field of withPlaceholder) {
    assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder`);
    assert.ok(field.placeholder.en, `field "${field.key}": placeholder needs an English text`);
  }
});
