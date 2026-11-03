const API_BASE = "https://data.tmw.at";
const TMW_HOST = "data.tmw.at";
const START_ID = "164392";
const CORS_PROXIES = [
  (url) => `https://cors.tools/${url}`,
  (url) => `https://proxy.cors.dev/${url}`,
];

let localProxyOk = null;

function apiTargets(path) {
  const rel = path.startsWith("/") ? path : `/${path}`;
  const direct = `${API_BASE}${rel}`;
  const urls = [];
  try {
    const params = new URLSearchParams(location.search);
    const override = params.get("api");
    if (override) urls.push(`${override.replace(/\/+$/, "")}${rel}`);
    const host = location.hostname;
    if (localProxyOk !== false && (host === "localhost" || host === "127.0.0.1")) {
      urls.push(`${location.protocol}//${location.host}/tmw${rel}`);
    }
  } catch {
    /* ignore */
  }
  // data.tmw.at does not send Access-Control-Allow-Origin, so skip a direct
  // fetch (it only produces a CORS error in the console) and use proxies.
  for (const proxy of CORS_PROXIES) urls.push(proxy(direct));
  return [...new Set(urls)];
}

const RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

const COLORS = {
  object: "#f4d35e",
  person: "#7ec8ff",
  thesaurus: "#c084fc",
  external: "#64748b",
  selected: "#f43f5e",
};

const STAR_LIFE = {
  fadeAfterMs: 8000,
  fadeForMs: 6000,
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
const restartBtn = document.getElementById("restart-from-star");
const fadeToggle = document.getElementById("fade-stars");
const FADE_STORAGE_KEY = "tmw-universe-fade-stars";
let fadeStarsEnabled = true;

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
let camTarget = { x: 0, y: 0, z: 0 };
let panning = false;
let jumpSeq = 0;

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

function hash01(key, salt) {
  let h = salt >>> 0;
  for (let i = 0; i < key.length; i += 1) {
    h = Math.imul(h ^ key.charCodeAt(i), 2654435761) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917) >>> 0;
  h ^= h >>> 16;
  return h / 4294967296;
}

const RECORD_FORMATS = new Set(["xml", "json", "lido", "turtle", "cidoc", "html", "skos", "rdf", "jsonld", "n3"]);

function parseTmwRef(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const idOnly = raw.match(/^(object|person|thesaurus)\s*[/:]\s*(\d+)$/i);
  if (idOnly) {
    return { type: idOnly[1].toLowerCase(), id: idOnly[2], internal: true };
  }
  const lref = raw.match(/(object_name_lref|subject_lref|creator_lref)[:/=](\d+)/i);
  if (lref) {
    const field = lref[1].toLowerCase();
    if (field === "creator_lref") {
      return { type: "person", id: lref[2], internal: true };
    }
    return { type: "thesaurus", id: lref[2], internal: true };
  }

  if (/^\d+$/.test(raw)) {
    return { type: "object", id: raw, internal: true, guess: true };
  }

  try {
    const url = new URL(raw, `${API_BASE}/`);
    const host = (url.hostname || "").replace(/^www\./, "");
    if (url.hostname && host !== TMW_HOST && host !== "localhost") {
      return { type: "external", id: raw, label: raw, internal: false, href: raw };
    }
    const parts = url.pathname
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter((part) => part && !RECORD_FORMATS.has(part.toLowerCase()));
    while (parts.length >= 3 && parts[1].toLowerCase() === parts[0].toLowerCase()) {
      parts.splice(1, 1);
    }
    if (parts.length >= 2 && ["object", "person", "thesaurus"].includes(parts[0].toLowerCase())) {
      const type = parts[0].toLowerCase();
      const idPart = parts.slice(1).find((part) => /^\d+$/.test(part));
      if (idPart) return { type, id: idPart, internal: true };
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
    scatterU: hash01(key, 7),
    scatterV: hash01(key, 19),
    scatterW: hash01(key, 31),
    scatterJ: hash01(key, 47),
    x: 0,
    y: 0,
    z: 0,
    placed: false,
    displayDepth: depth,
    freshAt: performance.now(),
  };
  graph.nodes.set(key, node);
  return node;
}

function touchNode(node, at = performance.now()) {
  if (node) node.freshAt = at;
}

function refreshActiveStars(at = performance.now()) {
  if (!fadeStarsEnabled) return;
  const origin = graph.nodes.get(graph.origin);
  touchNode(origin, at);
  touchNode(graph.nodes.get(graph.selected), at);
  touchNode(graph.nodes.get(hoverKey), at);
  if (!origin) return;
  for (const key of origin.neighbors) {
    touchNode(graph.nodes.get(key), at);
  }
}

function isKeptStar(node) {
  if (!node) return false;
  if (node.key === graph.selected || node.key === graph.origin || node.key === hoverKey) return true;
  const origin = graph.nodes.get(graph.origin);
  return Boolean(origin?.neighbors.includes(node.key));
}

function starAlpha(node, at = performance.now()) {
  if (!fadeStarsEnabled || !node || isKeptStar(node)) return 1;
  const age = at - (node.freshAt || 0);
  if (age <= STAR_LIFE.fadeAfterMs) return 1;
  return Math.max(0, 1 - (age - STAR_LIFE.fadeAfterMs) / STAR_LIFE.fadeForMs);
}

function removeNode(node) {
  if (!node || node.key === graph.selected || node.key === graph.origin) return;
  for (const key of node.neighbors) {
    const other = graph.nodes.get(key);
    if (other) other.neighbors = other.neighbors.filter((neighbor) => neighbor !== node.key);
    graph.edges.delete(edgeKey(node.key, key));
  }
  graph.nodes.delete(node.key);
  if (hoverKey === node.key) hoverKey = null;
}

function pruneFadedStars(at = performance.now()) {
  if (!fadeStarsEnabled) return;
  for (const node of [...graph.nodes.values()]) {
    if (isKeptStar(node)) continue;
    if (starAlpha(node, at) > 0.02) continue;
    removeNode(node);
  }
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
  const raw = el?.localName || el?.nodeName || "";
  return String(raw).split(":").pop().toLowerCase();
}

function walkElements(root) {
  const out = [];
  const visit = (node) => {
    for (const child of node.children || []) {
      out.push(child);
      visit(child);
    }
  };
  if (root) visit(root);
  return out;
}

function elementsByLocalName(root, name) {
  const wanted = name.toLowerCase();
  const nodes = root?.getElementsByTagName?.("*");
  const list = nodes && nodes.length ? [...nodes] : walkElements(root);
  return list.filter((el) => localName(el) === wanted);
}

function rdfAttr(el, name) {
  if (!el) return "";
  return (
    el.getAttributeNS?.(RDF_NS, name)
    || el.getAttribute?.(`rdf:${name}`)
    || el.getAttribute?.(name)
    || ""
  );
}

function ownText(el) {
  if (!el) return "";
  const parts = [];
  for (const node of el.childNodes) {
    if (node.nodeType === 3) parts.push(node.textContent);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function childText(el, names) {
  if (!el) return "";
  const wanted = names.map((n) => n.toLowerCase());
  for (const child of walkElements(el)) {
    if (wanted.includes(localName(child))) {
      const text = ownText(child);
      if (text) return text;
    }
  }
  return "";
}

function looksLikeXml(text) {
  const trimmed = String(text || "").trim();
  return trimmed.startsWith("<") && !/^<!doctype html/i.test(trimmed) && !/^<html[\s>]/i.test(trimmed);
}

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (elementsByLocalName(doc, "parsererror").length) {
    throw new Error("Ungültige XML-Antwort");
  }
  return doc;
}

function extractLabel(record, fallback) {
  const title = asList(record.title?.text)[0]?.string || record.title?.string;
  return title || record.name || record.prefLabel || record.term || fallback;
}

function addSkosRef(refs, seen, value, label, linkType) {
  const parsed = parseTmwRef(value);
  if (!parsed) return;
  const type = parsed.internal === false ? "external" : (linkType || "link");
  const key = `${parsed.type}:${parsed.id}:${type}`;
  if (seen.has(key)) return;
  seen.add(key);
  refs.push({
    ...parsed,
    label: label || parsed.label || parsed.id,
    linkType: type,
  });
}

function parseSkos(xmlText, fallbackId) {
  const doc = parseXml(xmlText);
  const concepts = elementsByLocalName(doc, "concept");
  const main = concepts.find((concept) => {
    const parsed = parseTmwRef(rdfAttr(concept, "about"));
    return parsed?.type === "thesaurus" && parsed.id === String(fallbackId);
  }) || concepts[0] || doc;
  const pref = childText(main, ["prefLabel"]) || `thesaurus ${fallbackId}`;
  const note = childText(main, ["scopeNote", "scopenote", "note"]);
  const description = note && !/^status\s*:/i.test(note) ? note : "";
  const labels = new Map();
  for (const concept of concepts) {
    const about = rdfAttr(concept, "about");
    const label = childText(concept, ["prefLabel", "label"]);
    if (about && label) labels.set(about, label);
  }
  const refs = [];
  const seen = new Set();
  for (const rel of ["broader", "narrower", "related", "exactmatch"]) {
    const linkType = rel === "exactmatch" ? "external" : rel;
    for (const el of elementsByLocalName(main, rel)) {
      const resource = rdfAttr(el, "resource");
      addSkosRef(refs, seen, resource, labels.get(resource) || "", linkType);
      for (const child of el.children || []) {
        if (localName(child) !== "concept") continue;
        const about = rdfAttr(child, "about") || rdfAttr(child, "resource");
        addSkosRef(
          refs,
          seen,
          about,
          childText(child, ["label", "prefLabel"]) || labels.get(about) || "",
          linkType,
        );
      }
    }
  }
  return { label: pref, description, refs };
}

function parseLido(xmlText, fallbackId) {
  const doc = parseXml(xmlText);
  const titleWrap = elementsByLocalName(doc, "titleWrap")[0];
  const label = (titleWrap && childText(titleWrap, ["appellationValue"]))
    || childText(doc, ["appellationValue"])
    || `object ${fallbackId}`;
  const description = childText(doc, ["descriptiveNoteValue"]);
  const refs = [];
  const seen = new Set();

  const add = (value, name, linkType) => {
    addSkosRef(refs, seen, value, name, linkType);
  };

  for (const el of elementsByLocalName(doc, "objectWorkType")) {
    add(childText(el, ["conceptID"]), childText(el, ["term"]), "object_name");
  }
  for (const el of elementsByLocalName(doc, "classification")) {
    add(childText(el, ["conceptID"]), childText(el, ["term"]), "subject");
  }
  for (const el of elementsByLocalName(doc, "actorInRole")) {
    const actor = elementsByLocalName(el, "actor")[0] || el;
    const rawName = childText(actor, ["nameActorSet"]) || ownText(actor);
    add(childText(actor, ["actorID"]), rawName.split(";")[0].trim() || rawName, "creator");
  }
  for (const el of elementsByLocalName(doc, "place")) {
    add(childText(el, ["placeID"]), childText(el, ["namePlaceSet"]) || childText(el, ["appellationValue"]), "subject");
  }
  for (const el of elementsByLocalName(doc, "repositorySet")) {
    add(childText(el, ["actorID"]), childText(el, ["nameActorSet"]) || childText(el, ["appellationValue"]), "collection");
  }
  for (const el of elementsByLocalName(doc, "relatedWork")) {
    add(childText(el, ["objectID"]), childText(el, ["displayObject"]), "related_object");
  }
  for (const el of elementsByLocalName(doc, "subjectConcept")) {
    add(childText(el, ["conceptID"]), childText(el, ["term"]), "subject");
  }
  return { label, description, refs };
}

function parsePersonRdf(xmlText, fallbackId) {
  const doc = parseXml(xmlText);
  const person = elementsByLocalName(doc, "person")[0] || doc;
  const label = childText(person, ["name"]) || `person ${fallbackId}`;
  const description = [
    childText(person, ["description"]),
    childText(person, ["jobTitle"]),
  ].filter(Boolean).join(" ");
  const refs = [];
  const seen = new Set();
  for (const el of elementsByLocalName(person, "sameAs")) {
    addSkosRef(refs, seen, rdfAttr(el, "resource") || ownText(el), "", "external");
  }
  return { label, description, refs };
}

function collectLidoSearchRefs(xmlText) {
  const doc = parseXml(xmlText);
  const records = elementsByLocalName(doc, "lido").filter((el) => localName(el.parentElement || el) !== "lido");
  const wrapped = records.length ? records : elementsByLocalName(doc, "lido");
  const refs = [];
  const seen = new Set();
  for (const record of wrapped) {
    if (localName(record) !== "lido") continue;
    const recId = childText(record, ["recordID"]);
    const parsed = parseTmwRef(childText(record, ["lidoRecID"]) || recId);
    const id = parsed?.type === "object" ? parsed.id : (/^\d+$/.test(recId) ? recId : null);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const titleWrap = elementsByLocalName(record, "titleWrap")[0];
    refs.push({
      type: "object",
      id: String(id),
      internal: true,
      label: (titleWrap && childText(titleWrap, ["appellationValue"])) || `object ${id}`,
    });
  }
  return { refs, total: refs.length };
}

async function tmwFetch(path) {
  for (const url of apiTargets(path)) {
    const localProxy = url.includes("/tmw/");
    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (localProxy) localProxyOk = false;
        continue;
      }
      const text = await response.text();
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("html") && !looksLikeXml(text)) {
        if (localProxy) localProxyOk = false;
        continue;
      }
      if (!String(text || "").trim()) continue;
      if (localProxy) localProxyOk = true;
      return { text, contentType };
    } catch {
      if (localProxy) localProxyOk = false;
    }
  }
  return null;
}

async function fetchFirstOk(paths) {
  for (const path of paths) {
    const payload = await tmwFetch(path);
    if (payload) return payload;
  }
  return null;
}

function placeAtOrigin(node) {
  node.x = 0;
  node.y = 0;
  node.z = 0;
  node.placed = true;
}

function placeNear(parent, node) {
  if (node.placed) return;
  if (!parent?.placed) {
    placeAtOrigin(node);
    return;
  }
  const u = node.scatterU ?? hash01(node.key, 7);
  const v = node.scatterV ?? hash01(node.key, 19);
  const w = node.scatterW ?? hash01(node.key, 31);
  const theta = u * Math.PI * 2;
  const phi = Math.acos(2 * v - 1);
  const dist = 110 + w * 220;
  node.x = parent.x + dist * Math.sin(phi) * Math.cos(theta);
  node.y = parent.y + dist * Math.cos(phi);
  node.z = parent.z + dist * Math.sin(phi) * Math.sin(theta);
  node.placed = true;
}

function connectRef(from, ref, depth) {
  const neighbor = ensureNode(ref, ref.label, depth);
  const type = ref.internal === false ? "external" : (ref.linkType || "link");
  linkNodes(from, neighbor, type);
  for (const extra of ref.extraLinkTypes || []) {
    linkNodes(from, neighbor, extra);
  }
  placeNear(from, neighbor);
  return neighbor;
}

async function expandOneHop(origin) {
  const seq = jumpSeq;
  const neighbors = origin.neighbors
    .map((key) => graph.nodes.get(key))
    .filter((node) => node && node.internal && !node.loaded && node.type !== "external");
  if (!neighbors.length) return;
  setStatus(`Lade Umgebung von ${origin.label}…`);
  await Promise.all(neighbors.map(async (node) => {
    try {
      if (seq !== jumpSeq) return;
      await expandNode(node, { quiet: true });
    } catch {
      if (seq === jumpSeq && graph.nodes.get(node.key) === node) node.loaded = true;
    }
  }));
}

async function fetchXmlRecord(path, missingMessage) {
  const payload = await tmwFetch(path);
  if (!payload || !looksLikeXml(payload.text)) throw new Error(missingMessage);
  return payload.text;
}

async function fetchRecord(type, id) {
  if (type === "thesaurus") {
    return parseSkos(
      await fetchXmlRecord(`/thesaurus/${id}/xml`, `Thesaurus ${id} nicht gefunden`),
      id,
    );
  }

  if (type === "object") {
    return parseLido(
      await fetchXmlRecord(`/object/${id}/lido`, `object ${id} nicht gefunden`),
      id,
    );
  }

  if (type === "person") {
    return parsePersonRdf(
      await fetchXmlRecord(`/person/${id}/xml`, `person ${id} nicht gefunden`),
      id,
    );
  }

  throw new Error(`${type} ${id} nicht gefunden`);
}

function encodeSearchValue(value) {
  return encodeURIComponent(value).replace(/%2A/gi, "*");
}

function nameQueryVariants(raw) {
  const q = raw.trim().replace(/\|/g, " ");
  const variants = [];
  const add = (value) => {
    const next = String(value || "").trim();
    if (next && !variants.includes(next)) variants.push(next);
  };
  add(q);
  const words = q.replace(/[()]/g, " ").split(/[\s,;]+/).filter((word) => word.length > 1);
  if (words.length >= 2) {
    add(`${words[words.length - 1]}, ${words.slice(0, -1).join(" ")}`);
  }
  if (q && !q.endsWith("*") && words.length <= 2) add(`${q}*`);
  return variants.slice(0, 3);
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function scoreNameHit(query, hit) {
  const q = normalizeSearchText(query.replace(/\*$/, ""));
  const label = normalizeSearchText(hit.label);
  if (!q || !label) return 0;
  if (label === q) return 1000;
  if (label.startsWith(q)) return 850 - Math.min(label.length, 80);
  if (` ${label} `.includes(` ${q} `)) return 720 - Math.min(label.length, 80);
  if (label.includes(q)) return 540 - Math.min(label.length, 80);
  const tokens = q.split(/\s+/).filter((token) => token.length > 1);
  if (!tokens.length || tokens.length === 1) return 0;
  if (!tokens.every((token) => label.includes(token))) return 0;
  return 400 + tokens.length * 10 - Math.min(label.length, 80);
}

function collectJsonLdHits(data, type) {
  const nodes = asList(data?.["@graph"] || data);
  const hits = [];
  for (const node of nodes) {
    const parsed = parseTmwRef(node?.["@id"] || node?.url || node?.id);
    if (!parsed?.internal || parsed.type !== type) continue;
    const label = node.name || node.prefLabel || node.title || node["skos:prefLabel"] || `${type} ${parsed.id}`;
    hits.push({
      type,
      id: parsed.id,
      internal: true,
      label: typeof label === "object" ? (label["@value"] || label.string || parsed.id) : String(label),
    });
  }
  return hits;
}

async function fetchNameHits(type, field, query) {
  const encoded = encodeSearchValue(query);
  const format = type === "object" ? "lido" : (type === "person" ? "xml" : "xml");
  const payload = await fetchFirstOk([
    `/${type}/${field}:${encoded}|limit=20/${format}`,
    `/${type}/${field}:${encoded}|limit=20/json`,
  ]);
  if (!payload) return [];
  try {
    if (looksLikeXml(payload.text) && /lido/i.test(payload.text)) {
      return collectLidoSearchRefs(payload.text).refs.map((ref) => ({ ...ref, type: "object" }));
    }
    if (looksLikeXml(payload.text)) {
      const doc = parseXml(payload.text);
      const hits = [];
      const seen = new Set();
      const tags = type === "person" ? ["person"] : ["concept"];
      for (const el of elementsByLocalName(doc, tags[0])) {
        const parsed = parseTmwRef(rdfAttr(el, "about") || rdfAttr(el, "resource"));
        if (!parsed?.internal || parsed.type !== type || seen.has(parsed.id)) continue;
        seen.add(parsed.id);
        hits.push({
          type,
          id: parsed.id,
          internal: true,
          label: childText(el, ["name", "prefLabel", "label"]) || `${type} ${parsed.id}`,
        });
      }
      return hits;
    }
    if (payload.contentType.includes("json") || payload.text.trim().startsWith("{")) {
      const data = JSON.parse(payload.text);
      const hits = [];
      for (const record of asList(data?.recordList?.record)) {
        const id = record?.id;
        if (!id) continue;
        hits.push({
          type,
          id: String(id),
          internal: true,
          label: extractLabel(record, `${type} ${id}`),
        });
      }
      if (hits.length) return hits;
      return collectJsonLdHits(data, type);
    }
  } catch {
    return [];
  }
  return [];
}

async function resolveNameQuery(query) {
  const variants = nameQueryVariants(query);
  const searches = [];
  for (const variant of variants) {
    searches.push(fetchNameHits("object", "title", variant));
    searches.push(fetchNameHits("person", "name", variant));
    searches.push(fetchNameHits("thesaurus", "term", variant));
  }
  const groups = await Promise.all(searches.map((job) => job.catch(() => [])));
  const byKey = new Map();
  for (const hit of groups.flat()) {
    const key = nodeKey(hit.type, hit.id);
    if (!byKey.has(key)) byKey.set(key, hit);
  }
  return [...byKey.values()]
    .map((hit) => ({ ...hit, score: scoreNameHit(query, hit) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || typeRank(a.type) - typeRank(b.type) || a.label.length - b.label.length);
}

function typeRank(type) {
  return { thesaurus: 0, person: 1, object: 2 }[type] ?? 9;
}

async function jumpTo(query) {
  const trimmed = String(query || "").trim();
  let parsed = parseTmwRef(trimmed);
  if (!parsed) {
    if (!trimmed) {
      setStatus("Bitte einen Namen, eine TMW-ID oder eine URL eingeben, z. B. Silberpfeil oder person/250326.");
      return;
    }
    setStatus(`Suche „${trimmed}"…`);
    const hits = await resolveNameQuery(trimmed);
    if (!hits.length) {
      setStatus(`Kein Treffer für „${trimmed}".`);
      return;
    }
    parsed = hits[0];
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

  const seq = ++jumpSeq;
  if (flight?.done) flight.done();
  flight = null;
  restartBtn.disabled = true;
  let lastError = null;
  try {
    for (const attempt of attempts) {
      if (seq !== jumpSeq) return;
      try {
        setStatus(`Lade ${attempt.type} ${attempt.id}…`);
        const current = graph.nodes.get(nodeKey(attempt.type, attempt.id));
        if (current) updatePanel(current);
        const payload = await fetchRecord(attempt.type, attempt.id);
        if (seq !== jumpSeq) return;
        camDist = 720;
        zoom = 1;
        yaw = 0.35;
        pitch = 0.18;
        camTarget = { x: 0, y: 0, z: 0 };
        graph.nodes.clear();
        graph.edges.clear();
        const origin = ensureNode(attempt, payload.label, 0);
        origin.loaded = true;
        origin.description = payload.description;
        origin.label = payload.label;
        placeAtOrigin(origin);
        graph.origin = origin.key;
        graph.selected = origin.key;
        searchInput.value = `${attempt.type}/${attempt.id}`;
        for (const ref of payload.refs) {
          connectRef(origin, ref, 1);
        }
        await expandOneHop(origin);
        if (seq !== jumpSeq) return;
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
  } finally {
    if (seq === jumpSeq) restartBtn.disabled = false;
  }
}

async function flyTo(node) {
  if (!node.internal) {
    graph.selected = node.key;
    updatePanel(node);
    setStatus("Anderes Universum — wird nicht verfolgt.");
    return;
  }
  if (flight) return;

  const seq = jumpSeq;
  graph.selected = node.key;
  updatePanel(node);
  graph.origin = node.key;
  try {
    await expandNode(node);
    if (seq !== jumpSeq || graph.nodes.get(node.key) !== node) return;
    await expandOneHop(node);
    if (seq !== jumpSeq || graph.nodes.get(node.key) !== node) return;
    updatePanel(node);
    recomputeDepths(node.key);
  } catch (error) {
    if (seq !== jumpSeq) return;
    setStatus(error.message);
  }
  if (seq !== jumpSeq || graph.nodes.get(node.key) !== node) return;
  for (const star of graph.nodes.values()) star.displayDepth = star.depth;
  setStatus(`${node.label} · ${node.neighbors.length} Verbindungen`);
}

async function expandNode(node, { quiet = false } = {}) {
  if (!node.internal || node.loaded || node.type === "external") return;
  const seq = jumpSeq;
  if (!quiet) setStatus(`Erkunde ${node.label}…`);
  const payload = await fetchRecord(node.type, node.id);
  if (seq !== jumpSeq || graph.nodes.get(node.key) !== node) return;
  node.loaded = true;
  node.label = payload.label;
  node.description = payload.description;
  for (const ref of payload.refs) {
    connectRef(node, ref, node.depth + 1);
  }
  if (!quiet) setStatus(`${node.label} · ${node.neighbors.length} Verbindungen`);
}

function updatePanel(node) {
  const idEl = document.getElementById("panel-id");
  if (!node) {
    panel.hidden = true;
    restartBtn.hidden = true;
    idEl.hidden = true;
    idEl.removeAttribute("href");
    idEl.textContent = "";
    return;
  }
  panel.hidden = false;
  document.getElementById("panel-type").textContent = node.internal ? node.type : "anderes Universum";
  document.getElementById("panel-title").textContent = node.label;
  const href = String(node.href || "").trim();
  if (/^https?:\/\//i.test(href)) {
    idEl.hidden = false;
    idEl.href = href;
    idEl.textContent = href;
  } else {
    idEl.hidden = true;
    idEl.removeAttribute("href");
    idEl.textContent = "";
  }
  document.getElementById("panel-description").textContent = node.description
    ? node.description.slice(0, 700)
    : node.internal
      ? (node.loaded ? "" : "Klicken, um diesen Stern zu laden.")
      : "Diese Verlinkung führt aus dem TMW-Datenpool hinaus und wird nicht verfolgt.";
  restartBtn.hidden = !node.internal;
}

function resize() {
  width = canvas.width = window.innerWidth * devicePixelRatio;
  height = canvas.height = window.innerHeight * devicePixelRatio;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
}

function worldPosition(node) {
  if (node?.placed) return { x: node.x, y: node.y, z: node.z };
  return { x: 0, y: 0, z: 0 };
}

function starSize(node, scale) {
  const links = linkCount(node);
  const byLinks = 2.8 + Math.sqrt(links) * 2.35;
  const near = Math.max(0.42, 1.18 - nodeDepth(node) * 0.14);
  const focus = node.key === graph.origin ? 1.18 : 1;
  return Math.max(2.4, byLinks * near * focus * scale * devicePixelRatio);
}

function updateFlight() {}

function cameraFocus() {
  return camTarget;
}

function panView(dx, dy) {
  const scale = 520 / Math.max(80, camDist / zoom);
  const moveX = dx / scale;
  const moveY = dy / scale;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const rightX = cy;
  const rightZ = -sy;
  const downX = -sp * sy;
  const downY = cp;
  const downZ = -sp * cy;
  camTarget.x -= rightX * moveX + downX * moveY;
  camTarget.y -= downY * moveY;
  camTarget.z -= rightZ * moveX + downZ * moveY;
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
  refreshActiveStars(now);
  pruneFadedStars(now);
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
      const alpha = Math.min(starAlpha(node, now), starAlpha(toNode, now));
      if (alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = style.width * devicePixelRatio;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawFlight(projected);

  const ordered = [...graph.nodes.values()].sort(
    (a, b) => projected.get(b.key).depth - projected.get(a.key).depth,
  );
  for (const node of ordered) {
    if (node.key === graph.selected) continue;
    drawStar(node, projected.get(node.key), false, starAlpha(node, now));
  }
  const selected = graph.nodes.get(graph.selected);
  if (selected) drawStar(selected, projected.get(selected.key), true, 1);
  ctx.shadowBlur = 0;

  const labeled = ordered.filter((node) => (
    node.key === graph.selected || node.depth === 0 || node.key === hoverKey
  ));
  labeled.sort((a, b) => {
    const aSel = a.key === graph.selected ? 1 : 0;
    const bSel = b.key === graph.selected ? 1 : 0;
    return aSel - bSel;
  });
  for (const node of labeled) {
    drawStarLabel(node, projected.get(node.key), starAlpha(node, now));
  }
  requestAnimationFrame(draw);
}

function drawStar(node, p, selected, alpha = 1) {
  if (!p || alpha <= 0) return;
  const color = selected ? COLORS.selected : (COLORS[node.type] || COLORS.external);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = selected ? 28 : 8 + Math.min(18, linkCount(node));
  ctx.arc(p.x, p.y, p.size * (0.62 + 0.38 * alpha), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawStarLabel(node, p, alpha = 1) {
  if (!p || !node.label || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const fontSize = 11 * devicePixelRatio;
  ctx.font = `${fontSize}px sans-serif`;
  const textW = ctx.measureText(node.label).width;
  const padX = 5 * devicePixelRatio;
  const padY = 3.2 * devicePixelRatio;
  const x = p.x + p.size + 7 * devicePixelRatio;
  const y = p.y + fontSize * 0.32;
  const boxX = x - padX;
  const boxY = y - fontSize + padY * 0.2;
  const boxW = textW + padX * 2;
  const boxH = fontSize + padY * 2;
  const radius = 4 * devicePixelRatio;
  ctx.fillStyle = "rgba(4, 6, 15, 0.9)";
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(boxX, boxY, boxW, boxH, radius);
  } else {
    ctx.rect(boxX, boxY, boxW, boxH);
  }
  ctx.fill();
  ctx.fillStyle = "#e8eefc";
  ctx.fillText(node.label, x, y);
  ctx.restore();
}

function hitTest(clientX, clientY) {
  const x = clientX * devicePixelRatio;
  const y = clientY * devicePixelRatio;
  let best = null;
  let bestDist = 18 * devicePixelRatio;
  for (const node of graph.nodes.values()) {
    if (starAlpha(node) < 0.2) continue;
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
  panning = event.shiftKey || event.altKey || event.button === 1 || event.button === 2;
  canvas.classList.add("dragging");
  if (panning) canvas.classList.add("panning");
  lastX = event.clientX;
  lastY = event.clientY;
  pointerStartX = event.clientX;
  pointerStartY = event.clientY;
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

window.addEventListener("pointerup", async (event) => {
  const wasDrag = dragging;
  const wasPan = panning;
  dragging = false;
  panning = false;
  canvas.classList.remove("dragging", "panning");
  if (!wasDrag || wasPan) return;
  const moved = Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY);
  if (moved > 4) return;
  const node = hitTest(event.clientX, event.clientY);
  if (!node) return;
  await flyTo(node);
});

window.addEventListener("pointermove", (event) => {
  if (dragging) {
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (panning || event.shiftKey || event.altKey) {
      panView(dx, dy);
    } else {
      yaw += dx * 0.005;
      pitch = Math.max(-1.1, Math.min(1.1, pitch + dy * 0.005));
    }
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

restartBtn.addEventListener("click", () => {
  const node = graph.nodes.get(graph.selected);
  if (!node?.internal) return;
  jumpTo(`${node.type}/${node.id}`);
});

function readFadePref() {
  try {
    const stored = localStorage.getItem(FADE_STORAGE_KEY);
    if (stored === "0") return false;
    if (stored === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

function setFadeStarsEnabled(enabled) {
  fadeStarsEnabled = Boolean(enabled);
  fadeToggle.checked = fadeStarsEnabled;
  try {
    localStorage.setItem(FADE_STORAGE_KEY, fadeStarsEnabled ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (fadeStarsEnabled) {
    const now = performance.now();
    for (const node of graph.nodes.values()) node.freshAt = now;
  }
}

fadeToggle.addEventListener("change", () => {
  setFadeStarsEnabled(fadeToggle.checked);
});
setFadeStarsEnabled(readFadePref());

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(draw);
jumpTo(START_ID);
