import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { groupSources, renderSourceGroups, sourceCategory } from '../js/sourceGroups.js';

class ElementStub {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.open = false;
    this.checked = false;
    this.indeterminate = false;
    this.disabled = false;
    this.scrollTop = 0;
    this._textContent = '';
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, listener) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(listener);
    this.listeners.set(type, handlers);
  }

  dispatch(type) {
    const event = { type, target: this, stopPropagation() { this.propagationStopped = true; } };
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }

  focus() { global.document.activeElement = this; }
  contains(node) {
    return this === node || this.children.some(child => child.contains(node));
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = node => {
      if (selector === 'input' && node.tagName === 'INPUT') matches.push(node);
      if (selector.startsWith('.') && node.className.split(/\s+/).includes(selector.slice(1))) matches.push(node);
      for (const child of node.children) visit(child);
    };
    for (const child of this.children) visit(child);
    return matches;
  }

  set innerHTML(value) {
    if (value === '') this.children = [];
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }
  get textContent() {
    return this._textContent + this.children.map(child => child.textContent).join('');
  }
}

function makeSource(name, category, kind = 'publisher', extra = {}) {
  return { name, category, kind, domain: `${name.toLowerCase().replaceAll(' ', '')}.example`, url: `https://${name.toLowerCase().replaceAll(' ', '')}.example/rss`, ...extra };
}

function makeContainer() {
  const container = new ElementStub('div');
  container.querySelectorAll = ElementStub.prototype.querySelectorAll;
  return container;
}

function findInput(container, label) {
  return container.querySelectorAll('input').find(input => input.getAttribute('aria-label') === label);
}

function renderRow(source, refreshCounts, selected) {
  const row = document.createElement('div');
  row.className = 'source-row';
  row.setAttribute('data-source', source.name);
  row.textContent = source.name;
  row.select = value => {
    selected.set(source.name, value);
    refreshCounts();
  };
  return row;
}

beforeEach(() => {
  global.document = {
    activeElement: null,
    createElement(tagName) { return new ElementStub(tagName); },
  };
});

test('category checkbox shows indeterminate state for a partial selection and refreshes from rows', () => {
  const sources = [makeSource('Alpha', 'Lifestyle'), makeSource('Beta', 'Lifestyle')];
  const selected = new Map([['Alpha', true], ['Beta', false]]);
  const container = makeContainer();
  renderSourceGroups(container, sources, {
    isSelected: source => selected.get(source.name),
    onToggle() {},
    renderRow: (source, refresh) => renderRow(source, refresh, selected),
  });

  const categoryCheckbox = findInput(container, 'Select all Lifestyle');
  assert.equal(categoryCheckbox.checked, false);
  assert.equal(categoryCheckbox.indeterminate, true);
  assert.equal(container.querySelectorAll('.source-group-count')[0].textContent, '1/2');

  const betaRow = container.querySelectorAll('.source-row').find(row => row.getAttribute('data-source') === 'Beta');
  betaRow.select(true);
  assert.equal(categoryCheckbox.checked, true);
  assert.equal(categoryCheckbox.indeterminate, false);
});

test('subcategory bulk selection calls onToggle with only visible matching sources', () => {
  const sources = [
    makeSource('Morning Wire', 'News', 'aggregator'),
    makeSource('Evening Wire', 'News', 'aggregator'),
    makeSource('Morning Journal', 'News', 'publisher'),
    makeSource('Morning Style', 'Lifestyle', 'publisher'),
  ];
  const calls = [];
  const container = makeContainer();
  renderSourceGroups(container, sources, {
    filterText: 'Morning',
    isSelected: () => false,
    onToggle: (items, value) => calls.push({ names: items.map(item => item.name), value }),
    renderRow: (source, refresh) => renderRow(source, refresh, new Map()),
  });

  const publishers = findInput(container, 'Select all Individual news feeds');
  publishers.checked = true;
  publishers.dispatch('change');
  assert.deepEqual(calls, [{ names: ['Morning Journal'], value: true }]);

  const aggregators = findInput(container, 'Select all News aggregators');
  aggregators.checked = false;
  aggregators.dispatch('change');
  assert.deepEqual(calls[1], { names: ['Morning Wire'], value: false });
});

test('bulk chooser excludes rows rejected by canSelect', () => {
  const sources = [
    makeSource('Available', 'Business'),
    makeSource('Unavailable', 'Business', 'publisher', { locked: true }),
  ];
  const calls = [];
  const container = makeContainer();
  renderSourceGroups(container, sources, {
    isSelected: () => false,
    canSelect: source => !source.locked,
    onToggle: (items, value) => calls.push({ names: items.map(item => item.name), value }),
    renderRow: (source, refresh) => renderRow(source, refresh, new Map()),
  });

  const checkbox = findInput(container, 'Select all Business');
  checkbox.checked = true;
  checkbox.dispatch('change');
  assert.deepEqual(calls, [{ names: ['Available'], value: true }]);
});

test('category disclosure state survives rerender and filtering opens matching categories', () => {
  const sources = [makeSource('Local News', 'News'), makeSource('Tech Daily', 'Technology')];
  const container = makeContainer();
  const options = {
    isSelected: () => false,
    onToggle() {},
    renderRow: (source, refresh) => renderRow(source, refresh, new Map()),
  };

  renderSourceGroups(container, sources, options);
  const [news, technology] = container.querySelectorAll('.source-category');
  news.open = false;
  technology.open = true;
  renderSourceGroups(container, sources, options);
  assert.deepEqual(container.querySelectorAll('.source-category').map(group => group.open), [false, true]);

  renderSourceGroups(container, sources, { ...options, filterText: 'Tech Daily' });
  const filteredCategories = container.querySelectorAll('.source-category');
  assert.equal(filteredCategories.length, 1);
  assert.equal(filteredCategories[0].getAttribute('data-category'), 'Technology');
  assert.equal(filteredCategories[0].open, true);
});

test('groups use category/type/name ordering and recognize search aliases', () => {
  const sources = [
    makeSource('Zeta', 'Lifestyle', 'publisher'),
    makeSource('Alpha', 'Lifestyle', 'aggregator'),
    makeSource('Daily Wire', 'Business', 'publisher'),
    makeSource('Other', 'Arts', 'publisher'),
  ];
  const groups = groupSources(sources);
  assert.deepEqual(groups.map(group => group.category), ['Business', 'Lifestyle', 'Arts']);
  assert.deepEqual(groups[1].aggregator.map(source => source.name), ['Alpha']);
  assert.deepEqual(groups[1].publisher.map(source => source.name), ['Zeta']);
  assert.equal(sourceCategory({ topics: ['POLITICS'] }), 'Politics');

  assert.deepEqual(groupSources(sources, 'news aggregators').map(group => group.category), ['Lifestyle']);
  assert.deepEqual(groupSources(sources, 'individual news feeds').map(group => group.category), ['Business', 'Lifestyle', 'Arts']);
  assert.deepEqual(groupSources(sources, 'daily wire').map(group => group.publisher.map(source => source.name)), [['Daily Wire']]);
});
