const API_BASE = "https://data.tmw.at";
const TMW_HOST = "data.tmw.at";
const START_ID = "164392";

const COLORS = {
  object: "#f4d35e",
  person: "#7ec8ff",
  thesaurus: "#c084fc",
  external: "#64748b",
};

const canvas = document.getElementById("space");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const panel = document.getElementById("panel");
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search");

const graph = {
  nodes: new Map(),
  origin: null,
  selected: null,
};

let width = 0;
let height = 0;
let yaw = 0.35;
let pitch = 0.18;
let dragging = false;
let lastX = 0;
let lastY = 0;
let pointerStartX = 0;
let pointerStartY = 0;
let hoverKey = null;

function recomputeDepths(originKey) {
  for (const node of graph.nodes.values()) {
    node.depth = node.key === originKey ? 0 : 99;
  }
  const queue = [originKey];
  const seen = new Set(queue);
  while (queue.length) {
    const key = queue.shift();
    const node = graph.nodes.get(key);
    if (!node) continue;
    for (const neighborKey of node.neighbors) {
      if (seen.has(neighborKey)) continue;
      seen.add(neighborKey);
      const neighbor = graph.nodes.get(neighborKey);
      neighbor.depth = node.depth + 1;
      queue.push(neighborKey);
    }
  }
}

function setStatus(text) {
  statusEl.textContent = text;
}

function asList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function hashAngle(key, salt) {
  let h = salt;
  for (let i = 0; i < key.length; i += 1) {
    h = (h * 33 + key.charCodeAt(i)) >>> 0;
  }
  return (h % 1000) / 1000 * Math.PI * 2;
}

function parseTmwRef(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const idOnly = raw.match(/^(object|person|thesaurus)\s*[/:]\s*(\d+)$/i);
  if (idOnly) {
    return { type: idOnly[1].toLowerCase(), id: idOnly[2], internal: true };
  }
  const objectNameLref = raw.match(/object_name_lref[:/=](\d+)/i);
  if (objectNameLref) {
    return { type: "thesaurus", id: objectNameLref[1], internal: true };
  }

  if (/^\d+$/.test(raw)) {
    return { type: "object", id: raw, internal: true, guess: true };
  }

  try {
    const url = new URL(raw, `${API_BASE}/`);
    if (url.hostname && url.hostname !== TMW_HOST && url.hostname !== "localhost") {
      return { type: "external", id: raw, label: raw, internal: false, href: raw };
    }
    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length >= 2 && ["object", "person", "thesaurus"].includes(parts[0])) {
      return { type: parts[0], id: parts[1], internal: true };
    }
  } catch {
    return { type: "external", id: raw, label: raw, internal: false, href: raw };
  }
  return null;
}

function nodeKey(type, id) {
  return `${type}:${id}`;
}

function ensureNode(ref, label, depth) {
  const key = nodeKey(ref.type, ref.id);
  const existing = graph.nodes.get(key);
  if (existing) {
    existing.depth = Math.min(existing.depth, depth);
    if (label && !existing.label) existing.label = label;
    return existing;
  }
  const node = {
    key,
    type: ref.type,
    id: ref.id,
    label: label || `${ref.type} ${ref.id}`,
    internal: ref.internal !== false,
    href: ref.href || (ref.internal === false ? ref.id : `${API_BASE}/${ref.type}/${ref.id}`),
    depth,
    loaded: false,
    description: "",
    neighbors: [],
    theta: hashAngle(key, 7),
    phi: 0.35 + (hashAngle(key, 19) % 1000) / 1000 * 1.9,
  };
  graph.nodes.set(key, node);
  return node;
}

function linkNodes(from, to) {
  if (!from.neighbors.includes(to.key)) from.neighbors.push(to.key);
  if (!to.neighbors.includes(from.key)) to.neighbors.push(from.key);
}

function extractLabel(record, fallback) {
  const title = asList(record.title?.text)[0]?.string || record.title?.string;
  return title || record.name || record.prefLabel || fallback;
}

function collectRefs(record) {
  const refs = [];
  const buckets = [
    record.creator?.text,
    record.collection?.text,
    record.object_name?.text,
    record.subject?.text,
    record.related_object?.text,
  ];
  for (const bucket of buckets) {
    for (const item of asList(bucket)) {
      const resource = item?.["@attributes"]?.resource || item?.resource;
      const parsed = parseTmwRef(resource);
      if (parsed) {
        refs.push({
          ...parsed,
          label: item.string || item.title || parsed.id,
        });
      }
    }
  }
  for (const item of asList(record.link?.text)) {
    const href = item.uri || item["@attributes"]?.resource;
    const parsed = parseTmwRef(href);
    if (parsed) {
      refs.push({
        ...parsed,
        label: item["@attributes"]?.type || parsed.id,
      });
    }
  }
  return refs;
}

function parseSkos(xmlText, fallbackId) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const pref = doc.querySelector("prefLabel")?.textContent || `thesaurus ${fallbackId}`;
  const refs = [];
  for (const node of doc.querySelectorAll("broader Concept, narrower Concept, related Concept, broader, narrower, related")) {
    const about = node.getAttribute("rdf:about") || node.getAttribute("about");
    const parsed = parseTmwRef(about);
    if (parsed) {
      refs.push({
        ...parsed,
        label: node.querySelector("label")?.textContent || parsed.id,
      });
    }
  }
  return { label: pref, description: "", refs };
}

const MAX_THESAURUS_OBJECTS = 40;

function collectObjectNameRefs(data) {
  const records = asList(data?.recordList?.record);
  const total = Number(data?.status?.count?.num) || records.length;
  const refs = [];
  for (const record of records.slice(0, MAX_THESAURUS_OBJECTS)) {
    const objectId = record?.id;
    if (!objectId) continue;
    refs.push({
      type: "object",
      id: String(objectId),
      internal: true,
      label: extractLabel(record, `object ${objectId}`),
    });
  }
  return { refs, total };
}

async function fetchThesaurusObjects(id) {
  const response = await fetch(`${API_BASE}/object/object_name_lref:${id}/json`);
  if (!response.ok) return { refs: [], total: 0 };
  return collectObjectNameRefs(await response.json());
}

function thesaurusObjectSummary(shown, total) {
  if (!shown) return "";
  if (total > shown) {
    return `${shown} Objekte mit diesem Begriff (von ${total}).`;
  }
  return `${shown} Objekt${shown === 1 ? "" : "e"} mit diesem Begriff.`;
}

async function fetchRecord(type, id) {
  if (type === "thesaurus") {
    const response = await fetch(`${API_BASE}/thesaurus/${id}/skos`);
    if (!response.ok) throw new Error(`Thesaurus ${id} nicht gefunden`);
    const parsed = parseSkos(await response.text(), id);
    let objects = { refs: [], total: 0 };
    try {
      objects = await fetchThesaurusObjects(id);
    } catch {
      objects = { refs: [], total: 0 };
    }
    return {
      ...parsed,
      description: parsed.description || thesaurusObjectSummary(objects.refs.length, objects.total),
      refs: [...parsed.refs, ...objects.refs],
    };
  }

  const response = await fetch(`${API_BASE}/${type}/${id}/json`);
  if (!response.ok) throw new Error(`${type} ${id} nicht gefunden`);
  const data = await response.json();
  const record = data?.recordList?.record;
  if (!record) throw new Error(`${type} ${id} nicht gefunden`);
  return {
    label: extractLabel(record, `${type} ${id}`),
    description: record.description || record.biography || "",
    refs: collectRefs(record),
    record,
  };
}

async function jumpTo(query) {
  const parsed = parseTmwRef(query);
  if (!parsed) {
    setStatus("Bitte eine TMW-ID oder URL eingeben, z. B. 164392 oder person/250326.");
    return;
  }
  if (!parsed.internal) {
    setStatus("Links außerhalb von data.tmw.at gehören zu einem anderen Universum und werden nicht verfolgt.");
    return;
  }

  const attempts = parsed.guess
    ? [
        { type: "object", id: parsed.id },
        { type: "person", id: parsed.id },
        { type: "thesaurus", id: parsed.id },
      ]
    : [{ type: parsed.type, id: parsed.id }];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      setStatus(`Lade ${attempt.type} ${attempt.id}…`);
      const payload = await fetchRecord(attempt.type, attempt.id);
      graph.nodes.clear();
      const origin = ensureNode(attempt, payload.label, 0);
      origin.loaded = true;
      origin.description = payload.description;
      origin.label = payload.label;
      graph.origin = origin.key;
      graph.selected = origin.key;
      for (const ref of payload.refs) {
        const neighbor = ensureNode(ref, ref.label, 1);
        linkNodes(origin, neighbor);
      }
      recomputeDepths(origin.key);
      updatePanel(origin);
      setStatus(`${origin.label} · ${payload.refs.length} Verbindungen`);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  setStatus(lastError?.message || "Datensatz nicht gefunden.");
}

async function expandNode(node) {
  if (!node.internal || node.loaded || node.type === "external") return;
  setStatus(`Erkunde ${node.label}…`);
  const payload = await fetchRecord(node.type, node.id);
  node.loaded = true;
  node.label = payload.label;
  node.description = payload.description;
  for (const ref of payload.refs) {
    const neighbor = ensureNode(ref, ref.label, node.depth + 1);
    linkNodes(node, neighbor);
  }
  setStatus(`${node.label} · ${node.neighbors.length} Verbindungen`);
}

function updatePanel(node) {
  if (!node) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  document.getElementById("panel-type").textContent = node.internal ? node.type : "anderes Universum";
  document.getElementById("panel-title").textContent = node.label;
  document.getElementById("panel-id").textContent = node.href;
  document.getElementById("panel-description").textContent = node.description
    ? node.description.slice(0, 700)
    : node.internal
      ? "Klicken, um diesen Stern zu laden."
      : "Diese Verlinkung führt aus dem TMW-Datenpool hinaus und wird nicht verfolgt.";
}

function resize() {
  width = canvas.width = window.innerWidth * devicePixelRatio;
  height = canvas.height = window.innerHeight * devicePixelRatio;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
}

function project(node) {
  const radius = 180 + node.depth * 220;
  const x = radius * Math.sin(node.phi) * Math.cos(node.theta);
  const y = radius * Math.cos(node.phi);
  const z = radius * Math.sin(node.phi) * Math.sin(node.theta);

  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  const xz = x * cy - z * sy;
  const zz = x * sy + z * cy;
  const yz = y * cp - zz * sp;
  const depth = y * sp + zz * cp + 720;
  const scale = 520 / depth;
  return {
    x: width / 2 + xz * scale * devicePixelRatio,
    y: height / 2 + yz * scale * devicePixelRatio,
    size: Math.max(2.2, (7 - node.depth) * scale * devicePixelRatio),
    depth,
    scale,
  };
}

function drawBackground() {
  ctx.fillStyle = "#04060f";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  for (let i = 0; i < 80; i += 1) {
    const x = (i * 97) % width;
    const y = (i * 53) % height;
    ctx.fillRect(x, y, 1.2 * devicePixelRatio, 1.2 * devicePixelRatio);
  }
}

function draw() {
  drawBackground();
  const projected = new Map();
  for (const node of graph.nodes.values()) {
    projected.set(node.key, project(node));
  }

  ctx.lineWidth = 1 * devicePixelRatio;
  for (const node of graph.nodes.values()) {
    const from = projected.get(node.key);
    for (const neighborKey of node.neighbors) {
      if (neighborKey < node.key) continue;
      const toNode = graph.nodes.get(neighborKey);
      const to = projected.get(neighborKey);
      if (!from || !to || !toNode) continue;
      ctx.strokeStyle = toNode.internal && node.internal
        ? "rgba(180, 198, 232, 0.28)"
        : "rgba(100, 116, 139, 0.35)";
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }

  const ordered = [...graph.nodes.values()].sort(
    (a, b) => projected.get(b.key).depth - projected.get(a.key).depth,
  );
  hoverKey = null;
  for (const node of ordered) {
    const p = projected.get(node.key);
    const color = COLORS[node.type] || COLORS.external;
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = node.key === graph.selected ? 24 : 10;
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (node.key === graph.selected || node.depth === 0 || node.key === hoverKey) {
      ctx.fillStyle = "#e8eefc";
      ctx.font = `${11 * devicePixelRatio}px sans-serif`;
      ctx.fillText(node.label, p.x + p.size + 6, p.y - 4);
    }
  }
  requestAnimationFrame(draw);
}

function hitTest(clientX, clientY) {
  const x = clientX * devicePixelRatio;
  const y = clientY * devicePixelRatio;
  let best = null;
  let bestDist = 18 * devicePixelRatio;
  for (const node of graph.nodes.values()) {
    const p = project(node);
    const dist = Math.hypot(p.x - x, p.y - y);
    if (dist < Math.max(bestDist, p.size + 8)) {
      best = node;
      bestDist = dist;
    }
  }
  return best;
}

canvas.addEventListener("pointerdown", (event) => {
  dragging = true;
  canvas.classList.add("dragging");
  lastX = event.clientX;
  lastY = event.clientY;
  pointerStartX = event.clientX;
  pointerStartY = event.clientY;
});

window.addEventListener("pointerup", async (event) => {
  const wasDrag = dragging;
  dragging = false;
  canvas.classList.remove("dragging");
  if (!wasDrag) return;
  const moved = Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY);
  if (moved > 4) return;
  const node = hitTest(event.clientX, event.clientY);
  if (!node) return;
  graph.selected = node.key;
  updatePanel(node);
  if (!node.internal) {
    setStatus("Anderes Universum — wird nicht verfolgt.");
    return;
  }
  graph.origin = node.key;
  try {
    await expandNode(node);
    recomputeDepths(node.key);
  } catch (error) {
    setStatus(error.message);
  }
});

window.addEventListener("pointermove", (event) => {
  if (dragging) {
    yaw += (event.clientX - lastX) * 0.005;
    pitch = Math.max(-1.1, Math.min(1.1, pitch + (event.clientY - lastY) * 0.005));
    lastX = event.clientX;
    lastY = event.clientY;
  }
  hoverKey = hitTest(event.clientX, event.clientY)?.key || null;
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  jumpTo(searchInput.value);
});

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(draw);
jumpTo(START_ID);
