const API_BASE = "https://data.tmw.at";
const TMW_HOST = "data.tmw.at";
const START_ID = "164392";

const RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

const COLORS = {
  object: "#f4d35e",
  person: "#7ec8ff",
  thesaurus: "#c084fc",
  external: "#64748b",
};

const LINK_STYLE = {
  narrower: { stroke: "rgba(52, 211, 153, 0.72)", width: 1.7 },
  broader: { stroke: "rgba(251, 146, 60, 0.72)", width: 1.7 },
  related: { stroke: "rgba(244, 114, 182, 0.65)", width: 1.4 },
  object_name: { stroke: "rgba(250, 204, 21, 0.55)", width: 1.2 },
  subject: { stroke: "rgba(167, 139, 250, 0.55)", width: 1.2 },
  creator: { stroke: "rgba(125, 211, 252, 0.55)", width: 1.2 },
  collection: { stroke: "rgba(165, 180, 252, 0.5)", width: 1.1 },
  related_object: { stroke: "rgba(253, 186, 116, 0.5)", width: 1.1 },
  link: { stroke: "rgba(148, 163, 184, 0.45)", width: 1 },
  external: { stroke: "rgba(100, 116, 139, 0.4)", width: 1 },
};

const LINK_PRIORITY = [
  "narrower",
  "broader",
  "related",
  "object_name",
  "subject",
  "creator",
  "collection",
  "related_object",
  "link",
  "external",
];

const canvas = document.getElementById("space");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const panel = document.getElementById("panel");
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search");

const graph = {
  nodes: new Map(),
  edges: new Map(),
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
let flight = null;
let camDist = 720;
let zoom = 1;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function nodeDepth(node) {
  return node.displayDepth ?? node.depth;
}

function linkCount(node) {
  return node.neighbors.length;
}

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
  const objectLref = raw.match(/(?:object_name_lref|subject_lref)[:/=](\d+)/i);
  if (objectLref) {
    return { type: "thesaurus", id: objectLref[1], internal: true };
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
    displayDepth: depth,
  };
  graph.nodes.set(key, node);
  return node;
}

function edgeKey(a, b) {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

function linkTypeOf(fromKey, toKey) {
  const stored = graph.edges.get(edgeKey(fromKey, toKey));
  if (!stored) return "link";
  for (const type of LINK_PRIORITY) {
    if (stored.has(type)) return type;
  }
  return [...stored][0] || "link";
}

function linkNodes(from, to, linkType = "link") {
  if (from.key === to.key) return;
  if (!from.neighbors.includes(to.key)) from.neighbors.push(to.key);
  if (!to.neighbors.includes(from.key)) to.neighbors.push(from.key);
  const key = edgeKey(from.key, to.key);
  const types = graph.edges.get(key) || new Set();
  types.add(linkType || "link");
  graph.edges.set(key, types);
}

function localName(el) {
  return (el.localName || el.nodeName.split(":").pop() || "").toLowerCase();
}

function elementsByLocalName(root, name) {
  const wanted = name.toLowerCase();
  return [...root.getElementsByTagName("*")].filter((el) => localName(el) === wanted);
}

function rdfAttr(el, name) {
  return (
    el.getAttributeNS?.(RDF_NS, name)
    || el.getAttribute(`rdf:${name}`)
    || el.getAttribute(name)
    || ""
  );
}

function childText(el, names) {
  const wanted = names.map((n) => n.toLowerCase());
  for (const child of el.getElementsByTagName("*")) {
    if (wanted.includes(localName(child))) {
      const text = (child.textContent || "").replace(/\s+/g, " ").trim();
      if (text) return text;
    }
  }
  return "";
}

function extractLabel(record, fallback) {
  const title = asList(record.title?.text)[0]?.string || record.title?.string;
  return title || record.name || record.prefLabel || fallback;
}

function collectRefs(record) {
  const refs = [];
  const buckets = [
    [record.creator?.text, "creator"],
    [record.collection?.text, "collection"],
    [record.object_name?.text, "object_name"],
    [record.subject?.text, "subject"],
    [record.related_object?.text, "related_object"],
  ];
  for (const [bucket, linkType] of buckets) {
    for (const item of asList(bucket)) {
      const resource = item?.["@attributes"]?.resource || item?.resource;
      const parsed = parseTmwRef(resource);
      if (parsed) {
        refs.push({
          ...parsed,
          label: item.string || item.title || parsed.id,
          linkType: parsed.internal === false ? "external" : linkType,
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
        linkType: parsed.internal === false ? "external" : "link",
      });
    }
  }
  return refs;
}

function addSkosRef(refs, seen, value, label, linkType) {
  const parsed = parseTmwRef(value);
  if (!parsed) return;
  const key = `${parsed.type}:${parsed.id}:${linkType}`;
  if (seen.has(key)) return;
  seen.add(key);
  refs.push({
    ...parsed,
    label: label || parsed.id,
    linkType,
  });
}

function parseSkos(xmlText, fallbackId) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const pref = childText(doc, ["prefLabel"]) || `thesaurus ${fallbackId}`;
  const description = childText(doc, ["scopeNote", "scopenote"]);
  const refs = [];
  const seen = new Set();
  for (const rel of ["broader", "narrower", "related"]) {
    for (const el of elementsByLocalName(doc, rel)) {
      addSkosRef(refs, seen, rdfAttr(el, "resource"), "", rel);
      for (const child of el.children || []) {
        if (localName(child) !== "concept") continue;
        addSkosRef(
          refs,
          seen,
          rdfAttr(child, "about") || rdfAttr(child, "resource"),
          childText(child, ["label", "prefLabel"]),
          rel,
        );
      }
    }
  }
  return { label: pref, description, refs };
}

const MAX_THESAURUS_OBJECTS = 40;

function collectObjectSearchRefs(data) {
  const records = asList(data?.recordList?.record);
  const total = Number(data?.status?.count?.num) || records.length;
  const refs = [];
  for (const record of records) {
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

async function fetchThesaurusObjectSearch(id, field, linkType) {
  const response = await fetch(`${API_BASE}/object/${field}:${id}/json`);
  if (!response.ok) return { refs: [], total: 0 };
  const result = collectObjectSearchRefs(await response.json());
  for (const ref of result.refs) ref.linkType = linkType;
  return result;
}

function mergeObjectSearches(...results) {
  const byId = new Map();
  let total = 0;
  for (const result of results) {
    total += result.total || 0;
    for (const ref of result.refs) {
      const existing = byId.get(ref.id);
      if (!existing) {
        byId.set(ref.id, { ...ref, extraLinkTypes: [] });
        continue;
      }
      if (ref.linkType && ref.linkType !== existing.linkType) {
        existing.extraLinkTypes.push(ref.linkType);
      }
    }
  }
  return {
    refs: [...byId.values()].slice(0, MAX_THESAURUS_OBJECTS),
    total,
  };
}

async function fetchThesaurusObjects(id) {
  const searches = await Promise.all([
    fetchThesaurusObjectSearch(id, "object_name_lref", "object_name"),
    fetchThesaurusObjectSearch(id, "subject_lref", "subject"),
  ]);
  return mergeObjectSearches(...searches);
}

function thesaurusObjectSummary(shown, total) {
  if (!shown) return "";
  if (total > shown) {
    return `${shown} Objekte mit diesem Begriff (von ${total}).`;
  }
  return `${shown} Objekt${shown === 1 ? "" : "e"} mit diesem Begriff.`;
}

function connectRef(from, ref, depth) {
  const neighbor = ensureNode(ref, ref.label, depth);
  const type = ref.internal === false ? "external" : (ref.linkType || "link");
  linkNodes(from, neighbor, type);
  for (const extra of ref.extraLinkTypes || []) {
    linkNodes(from, neighbor, extra);
  }
  return neighbor;
}

async function expandOneHop(origin) {
  const neighbors = origin.neighbors
    .map((key) => graph.nodes.get(key))
    .filter((node) => node && node.internal && !node.loaded && node.type !== "external");
  if (!neighbors.length) return;
  setStatus(`Lade Umgebung von ${origin.label}…`);
  await Promise.all(neighbors.map(async (node) => {
    try {
      await expandNode(node);
    } catch {
      node.loaded = true;
    }
  }));
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
      description: [parsed.description, thesaurusObjectSummary(objects.refs.length, objects.total)]
        .filter(Boolean)
        .join(" "),
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
      if (flight?.done) flight.done();
      flight = null;
      camDist = 720;
      zoom = 1;
      graph.nodes.clear();
      graph.edges.clear();
      const origin = ensureNode(attempt, payload.label, 0);
      origin.loaded = true;
      origin.description = payload.description;
      origin.label = payload.label;
      graph.origin = origin.key;
      graph.selected = origin.key;
      for (const ref of payload.refs) {
        connectRef(origin, ref, 1);
      }
      await expandOneHop(origin);
      recomputeDepths(origin.key);
      for (const node of graph.nodes.values()) node.displayDepth = node.depth;
      updatePanel(origin);
      setStatus(`${origin.label} · ${origin.neighbors.length} Verbindungen`);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  setStatus(lastError?.message || "Datensatz nicht gefunden.");
}

async function flyTo(node) {
  if (!node.internal) {
    graph.selected = node.key;
    updatePanel(node);
    setStatus("Anderes Universum — wird nicht verfolgt.");
    return;
  }
  if (flight) return;

  graph.selected = node.key;
  updatePanel(node);
  const fromNode = graph.nodes.get(graph.origin);

  if (fromNode && fromNode.key !== node.key) {
    setStatus(`Flug zu ${node.label}…`);
    await runFlight(fromNode, node);
  }

  graph.origin = node.key;
  recomputeDepths(node.key);
  const fromDepths = snapshotDepths(true);
  try {
    await expandNode(node);
    await expandOneHop(node);
    updatePanel(node);
    recomputeDepths(node.key);
  } catch (error) {
    setStatus(error.message);
  }
  const toDepths = snapshotDepths(false);
  await runLayoutSettle(fromDepths, toDepths);
  for (const star of graph.nodes.values()) star.displayDepth = star.depth;
  setStatus(`${node.label} · ${node.neighbors.length} Verbindungen`);
}

function runFlight(fromNode, toNode) {
  return new Promise((resolve) => {
    flight = {
      mode: "travel",
      fromKey: fromNode.key,
      toKey: toNode.key,
      start: performance.now(),
      duration: 2200,
      frames: 0,
      minFrames: 96,
      fromYaw: yaw,
      fromPitch: pitch,
      toYaw: yaw,
      toPitch: pitch,
      fromDist: camDist,
      toDist: 430,
      e: 0,
      done: resolve,
    };
  });
}

function runLayoutSettle(fromDepths, toDepths) {
  return new Promise((resolve) => {
    flight = {
      mode: "settle",
      fromKey: graph.origin,
      toKey: graph.origin,
      start: performance.now(),
      duration: 800,
      frames: 0,
      minFrames: 36,
      fromDepths,
      toDepths,
      fromYaw: yaw,
      fromPitch: pitch,
      toYaw: yaw,
      toPitch: pitch,
      fromDist: camDist,
      toDist: 720,
      e: 0,
      done: resolve,
    };
  });
}

async function expandNode(node) {
  if (!node.internal || node.loaded || node.type === "external") return;
  setStatus(`Erkunde ${node.label}…`);
  const payload = await fetchRecord(node.type, node.id);
  node.loaded = true;
  node.label = payload.label;
  node.description = payload.description;
  for (const ref of payload.refs) {
    connectRef(node, ref, node.depth + 1);
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

function worldPosition(node, depth = nodeDepth(node)) {
  const radius = 180 + depth * 220;
  return {
    x: radius * Math.sin(node.phi) * Math.cos(node.theta),
    y: radius * Math.cos(node.phi),
    z: radius * Math.sin(node.phi) * Math.sin(node.theta),
  };
}

function starSize(node, scale) {
  const links = linkCount(node);
  const byLinks = 2.8 + Math.sqrt(links) * 2.35;
  const near = Math.max(0.42, 1.18 - nodeDepth(node) * 0.14);
  const focus = node.key === graph.origin ? 1.18 : 1;
  return Math.max(2.4, byLinks * near * focus * scale * devicePixelRatio);
}

function snapshotDepths(useDisplay = true) {
  const depths = new Map();
  for (const node of graph.nodes.values()) {
    depths.set(node.key, useDisplay ? nodeDepth(node) : node.depth);
  }
  return depths;
}

function updateFlight(now) {
  if (!flight) return;
  flight.frames = (flight.frames || 0) + 1;
  const byTime = (now - flight.start) / flight.duration;
  const byFrames = flight.frames / (flight.minFrames || 1);
  const t = Math.min(1, Math.min(byTime, byFrames));
  const e = easeInOutCubic(t);
  flight.e = e;
  yaw = lerp(flight.fromYaw, flight.toYaw, e);
  pitch = lerp(flight.fromPitch, flight.toPitch, e);
  camDist = lerp(flight.fromDist, flight.toDist, e);
  if (flight.mode === "settle" && flight.fromDepths && flight.toDepths) {
    for (const node of graph.nodes.values()) {
      const from = flight.fromDepths.has(node.key) ? flight.fromDepths.get(node.key) : node.depth + 0.5;
      const to = flight.toDepths.has(node.key) ? flight.toDepths.get(node.key) : node.depth;
      node.displayDepth = lerp(from, to, e);
    }
  }
  if (t >= 1) {
    const done = flight.done;
    if (flight.mode === "travel" && flight.toKey) {
      graph.origin = flight.toKey;
    }
    if (flight.mode === "settle") {
      for (const node of graph.nodes.values()) node.displayDepth = node.depth;
    }
    camDist = flight.toDist;
    flight.e = 1;
    flight = null;
    if (done) done();
  }
}

function cameraFocus() {
  if (flight?.mode === "travel") {
    const from = graph.nodes.get(flight.fromKey);
    const to = graph.nodes.get(flight.toKey);
    if (from && to) {
      const e = flight.e ?? 0;
      const a = worldPosition(from);
      const b = worldPosition(to);
      return {
        x: lerp(a.x, b.x, e),
        y: lerp(a.y, b.y, e),
        z: lerp(a.z, b.z, e),
      };
    }
  }
  const origin = graph.nodes.get(graph.origin);
  return origin ? worldPosition(origin) : { x: 0, y: 0, z: 0 };
}

function project(node) {
  const p = worldPosition(node);
  const f = cameraFocus();
  const rx = p.x - f.x;
  const ry = p.y - f.y;
  const rz = p.z - f.z;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  const xz = rx * cy - rz * sy;
  const zz = rx * sy + rz * cy;
  const yz = ry * cp - zz * sp;
  const depth = ry * sp + zz * cp + camDist / zoom;
  const scale = 520 / Math.max(80, depth);
  return {
    x: width / 2 + xz * scale * devicePixelRatio,
    y: height / 2 + yz * scale * devicePixelRatio,
    size: starSize(node, scale),
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

function drawFlight(projected) {
  if (!flight || flight.mode !== "travel") return;
  const from = projected.get(flight.fromKey);
  const to = projected.get(flight.toKey);
  if (!from || !to) return;
  ctx.strokeStyle = "rgba(232, 238, 252, 0.55)";
  ctx.lineWidth = 2.2 * devicePixelRatio;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  // Camera tracks the ship, so the craft stays on the screen center.
  const px = width / 2;
  const py = height / 2;
  const glow = 11 * devicePixelRatio;
  ctx.beginPath();
  ctx.fillStyle = "#fff8dc";
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = 22;
  ctx.arc(px, py, glow, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  for (let i = 1; i <= 6; i += 1) {
    const along = i * 0.08;
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 248, 220, ${0.28 - i * 0.035})`;
    ctx.arc(lerp(px, from.x, along), lerp(py, from.y, along), glow * (1 - i * 0.1), 0, Math.PI * 2);
    ctx.fill();
  }
}

function draw() {
  const now = performance.now();
  updateFlight(now);
  drawBackground();
  const projected = new Map();
  for (const node of graph.nodes.values()) {
    projected.set(node.key, project(node));
  }

  for (const node of graph.nodes.values()) {
    const from = projected.get(node.key);
    for (const neighborKey of node.neighbors) {
      if (neighborKey < node.key) continue;
      const toNode = graph.nodes.get(neighborKey);
      const to = projected.get(neighborKey);
      if (!from || !to || !toNode) continue;
      const linkType = (!toNode.internal || !node.internal)
        ? "external"
        : linkTypeOf(node.key, neighborKey);
      const style = LINK_STYLE[linkType] || LINK_STYLE.link;
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = style.width * devicePixelRatio;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }

  drawFlight(projected);

  const ordered = [...graph.nodes.values()].sort(
    (a, b) => projected.get(b.key).depth - projected.get(a.key).depth,
  );
  for (const node of ordered) {
    const p = projected.get(node.key);
    const color = COLORS[node.type] || COLORS.external;
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = node.key === graph.selected ? 28 : 8 + Math.min(18, linkCount(node));
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
  if (flight) return;
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
  if (!wasDrag || flight) return;
  const moved = Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY);
  if (moved > 4) return;
  const node = hitTest(event.clientX, event.clientY);
  if (!node) return;
  await flyTo(node);
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

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const factor = event.deltaY > 0 ? 0.91 : 1.1;
  zoom = Math.min(4.2, Math.max(0.35, zoom * factor));
}, { passive: false });

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  jumpTo(searchInput.value);
});

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(draw);
jumpTo(START_ID);
