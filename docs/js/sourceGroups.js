const CATEGORY_ORDER = ['News', 'Politics', 'Business', 'Finance', 'Science', 'Technology', 'Lifestyle', 'Entertainment', 'Sports', 'Custom'];

export function sourceCategory(source) {
  if (source.category) return source.category;
  if (source.isCustom) return 'Custom';
  return ({ BUSINESS: 'Business', FINANCE: 'Finance', POLITICS: 'Politics', SCIENCE: 'Science',
    TECHNOLOGY: 'Technology', LIFESTYLE: 'Lifestyle', ENTERTAINMENT: 'Entertainment', SPORTS: 'Sports' })[source.topics?.[0]] || 'News';
}

export function groupSources(sources, filterText = '') {
  const query = filterText.toLowerCase().trim();
  const groups = new Map();
  for (const source of sources) {
    const category = sourceCategory(source);
    const kind = source.kind === 'aggregator' ? 'aggregator' : 'publisher';
    if (query && ![source.name, source.domain, source.url, category,
      kind === 'aggregator' ? 'news aggregators' : 'individual news feeds'].some(value => value?.toLowerCase().includes(query))) continue;
    if (!groups.has(category)) groups.set(category, { category, aggregator: [], publisher: [] });
    groups.get(category)[kind].push(source);
  }
  return [...groups.values()].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category), bi = CATEGORY_ORDER.indexOf(b.category);
    return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi) || a.category.localeCompare(b.category);
  }).map(group => ({ ...group,
    aggregator: group.aggregator.sort((a, b) => a.name.localeCompare(b.name)),
    publisher: group.publisher.sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

/** Accessible category > source type groups; bulk selection affects visible results only. */
export function renderSourceGroups(container, sources, { filterText = '', isSelected, onToggle, renderRow, canSelect = () => true }) {
  const opened = new Map([...container.querySelectorAll('.source-category')].map(node => [node.getAttribute('data-category'), node.open]));
  const scrollTop = container.scrollTop;
  const focusName = container.contains(document.activeElement) ? document.activeElement?.getAttribute('aria-label') : '';
  container.innerHTML = '';
  const groups = groupSources(sources, filterText);
  if (!groups.length) {
    const empty = document.createElement('p');
    empty.className = 'source-check-empty';
    empty.textContent = filterText ? `No sources match "${filterText}"` : 'No RSS sources available.';
    container.appendChild(empty);
    return;
  }
  const controls = [];
  const refreshCounts = () => {
    for (const { checkbox, feeds, count } of controls) {
      const available = feeds.filter(canSelect);
      const selected = available.filter(isSelected).length;
      checkbox.checked = !!available.length && selected === available.length;
      checkbox.indeterminate = selected > 0 && selected < available.length;
      checkbox.disabled = !available.length;
      count.textContent = `${selected}/${feeds.length}`;
    }
  };
  const makeControl = (feeds, title) => {
    const label = document.createElement('label');
    label.className = 'source-group-toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('aria-label', `Select all ${title}`);
    // Keep the group open when using its checkbox inside a details summary.
    checkbox.addEventListener('click', event => event.stopPropagation());
    checkbox.addEventListener('change', () => onToggle(feeds.filter(canSelect), checkbox.checked));
    const text = document.createElement('span');
    text.textContent = title;
    const count = document.createElement('span');
    count.className = 'source-group-count';
    label.appendChild(checkbox);
    label.appendChild(text);
    label.appendChild(count);
    controls.push({ checkbox, feeds, count });
    return label;
  };
  for (const group of groups) {
    const feeds = [...group.aggregator, ...group.publisher];
    const details = document.createElement('details');
    details.className = 'source-category';
    details.setAttribute('data-category', group.category);
    details.open = filterText ? true : opened.get(group.category) ?? true;
    const summary = document.createElement('summary');
    summary.appendChild(makeControl(feeds, group.category));
    details.appendChild(summary);
    for (const kind of ['aggregator', 'publisher']) {
      if (!group[kind].length) continue;
      const section = document.createElement('div');
      section.className = 'source-type-group';
      section.appendChild(makeControl(group[kind], kind === 'aggregator' ? 'News aggregators' : 'Individual news feeds'));
      const rows = document.createElement('div');
      rows.className = 'source-group-rows';
      for (const source of group[kind]) rows.appendChild(renderRow(source, refreshCounts));
      section.appendChild(rows);
      details.appendChild(section);
    }
    container.appendChild(details);
  }
  refreshCounts();
  container.scrollTop = scrollTop;
  if (focusName) [...container.querySelectorAll('input')].find(node => node.getAttribute('aria-label') === focusName)?.focus();
}
