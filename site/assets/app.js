// Minimal parser for the restricted YAML subset used by info.yaml:
// nested maps, "- key: value" list items, string/bool/number scalars.
// Not a general-purpose YAML parser.
function parseYamlLite(text) {
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    lines.push({ indent: raw.length - raw.trimStart().length, text: trimmed });
  }

  let pos = 0;

  function parseValue(raw) {
    if (raw === '') return undefined;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (/^-?\d+$/.test(raw)) return Number(raw);
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      return raw.slice(1, -1);
    }
    return raw;
  }

  function parseBlock(indent) {
    if (pos >= lines.length || lines[pos].indent < indent) return {};
    return lines[pos].text.startsWith('- ') ? parseList(indent) : parseMap(indent);
  }

  function parseList(indent) {
    const arr = [];
    while (pos < lines.length && lines[pos].indent === indent && lines[pos].text.startsWith('- ')) {
      const rest = lines[pos].text.slice(2);
      pos++;
      const item = {};
      const sepIdx = rest.indexOf(':');
      if (sepIdx !== -1) {
        const key = rest.slice(0, sepIdx).trim();
        const valRaw = rest.slice(sepIdx + 1).trim();
        item[key] = valRaw === '' ? parseBlock(indent + 2) : parseValue(valRaw);
      }
      while (pos < lines.length && lines[pos].indent > indent) {
        const subIndent = lines[pos].indent;
        const subLine = lines[pos].text;
        const sIdx = subLine.indexOf(':');
        const key = subLine.slice(0, sIdx).trim();
        const valRaw = subLine.slice(sIdx + 1).trim();
        pos++;
        item[key] = valRaw === '' ? parseBlock(subIndent + 2) : parseValue(valRaw);
      }
      arr.push(item);
    }
    return arr;
  }

  function parseMap(indent) {
    const obj = {};
    while (pos < lines.length && lines[pos].indent === indent && !lines[pos].text.startsWith('- ')) {
      const line = lines[pos];
      const sepIdx = line.text.indexOf(':');
      const key = line.text.slice(0, sepIdx).trim();
      const valRaw = line.text.slice(sepIdx + 1).trim();
      pos++;
      obj[key] = valRaw === '' ? parseBlock(indent + 2) : parseValue(valRaw);
    }
    return obj;
  }

  return parseMap(0);
}

// Icon names map to Iconify identifiers (https://icon-sets.iconify.design),
// rendered via the <iconify-icon> web component loaded in index.html.
const ICONS = {
  website: 'mdi:web',
  instagram: 'simple-icons:instagram',
  whatsapp: 'simple-icons:whatsapp',
  register: 'mdi:clipboard-check-outline',
};

function makeIcon(name, size) {
  const el = document.createElement('iconify-icon');
  el.setAttribute('icon', ICONS[name] || ICONS.website);
  el.setAttribute('width', size);
  el.setAttribute('height', size);
  return el;
}

function applyMeta(profile) {
  if (!profile) return;
  if (profile.title) {
    document.title = profile.title;
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', profile.title);
  }
  if (profile.description) {
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute('content', profile.description);
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) ogDescription.setAttribute('content', profile.description);
  }
}

function renderLinks(data) {
  applyMeta(data.profile);

  const app = document.getElementById('app');
  app.innerHTML = '';

  const profileTemplate = document.getElementById('profile-template');
  const profile = profileTemplate.content.firstElementChild.cloneNode(true);
  profile.querySelector('.logo').alt = data.profile?.title ?? '';
  profile.querySelector('.sr-only').textContent = data.profile?.title ?? '';
  const subtitleEl = profile.querySelector('.subtitle');
  if (data.profile?.subtitle) {
    subtitleEl.textContent = data.profile.subtitle;
  } else {
    subtitleEl.remove();
  }
  app.appendChild(profile);

  const linkTemplate = document.getElementById('link-template');
  const list = document.createElement('div');
  list.className = 'links';
  for (const link of data.links ?? []) {
    const node = linkTemplate.content.firstElementChild.cloneNode(true);
    node.href = link.url;
    if (link.highlight) node.classList.add('highlight');
    node.querySelector('.link-icon').appendChild(makeIcon(link.icon, 22));
    node.querySelector('.link-label').textContent = link.label;
    list.appendChild(node);
  }
  app.appendChild(list);

  if (data.footer) {
    const footerTemplate = document.getElementById('footer-link-template');
    const footer = document.createElement('div');
    footer.className = 'footer';
    if (data.footer.note) {
      const note = document.createElement('p');
      note.className = 'footer-note';
      note.textContent = data.footer.note;
      footer.appendChild(note);
    }
    const footerLinks = document.createElement('div');
    footerLinks.className = 'footer-links';
    for (const link of data.footer.links ?? []) {
      const node = footerTemplate.content.firstElementChild.cloneNode(true);
      node.href = link.url;
      node.querySelector('.link-icon').appendChild(makeIcon(link.icon, 16));
      node.querySelector('span:last-child').textContent = link.label;
      footerLinks.appendChild(node);
    }
    footer.appendChild(footerLinks);
    app.appendChild(footer);
  }
}

function renderError(message) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="error">${message}</div>`;
}

fetch('data/info.yaml')
  .then((res) => {
    if (!res.ok) throw new Error(`info.yaml konnte nicht geladen werden (${res.status})`);
    return res.text();
  })
  .then((text) => renderLinks(parseYamlLite(text)))
  .catch((err) => {
    console.error(err);
    renderError('Links konnten nicht geladen werden.');
  });
