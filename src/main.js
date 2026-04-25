const grid = document.getElementById("groups-grid");
const tooltip = document.getElementById("perk-tooltip");
const ADDON_ORDER = ["brown", "blue", "green", "purple", "red"];
const KILLERS_QUERY_PARAM = "killers";
const GROUP_SIZES = [
  2, 3, 4, 4, 3, 4, 3, 3, 4, 4, 4, 3, 4, 3, 2, 3, 3, 3, 2, 2, 3,
  4, 3, 4, 3, 3, 3, 4, 4, 4, 4, 3, 4, 4, 4, 4, 4, 3, 3, 3, 3, 2,
];

function normalizeImageKey(value) {
  return String(value || "").toLowerCase().normalize("NFC").trim();
}

function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");
}

function imageKeyVariants(value) {
  const base = normalizeImageKey(value);
  if (!base) return [];
  const noPx = base.replace(/^\d+px-/, "");
  const out = [base, noPx];
  const baseAscii = stripDiacritics(base);
  const noPxAscii = stripDiacritics(noPx);
  if (!out.includes(baseAscii)) out.push(baseAscii);
  if (!out.includes(noPxAscii)) out.push(noPxAscii);
  return out;
}

function moveTooltip(clientX, clientY) {
  const pad = 12;
  const rect = tooltip.getBoundingClientRect();
  let x = clientX + 18;
  let y = clientY + 18;

  if (x + rect.width + pad > window.innerWidth) {
    x = clientX - rect.width - 18;
  }
  if (y + rect.height + pad > window.innerHeight) {
    y = window.innerHeight - rect.height - pad;
  }
  if (x < pad) x = pad;
  if (y < pad) y = pad;

  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function cleanDescriptionHtml(rawHtml) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = rawHtml || "";

  const quoteNodes = wrapper.querySelectorAll(
    "span.luaClr.clr9, span[style*='#e7cda2'], span[style*='#E7CDA2']"
  );

  quoteNodes.forEach((node) => {
    const removable = node.closest("i") || node.closest("p") || node;
    removable?.parentNode?.removeChild(removable);
  });

  wrapper.querySelectorAll("p, i").forEach((node) => {
    if (!node.textContent || !node.textContent.trim()) {
      node.remove();
    }
  });

  return wrapper.innerHTML.trim();
}

function showTooltip(detail, event) {
  if (!detail || !detail.descriptionHtml) return;
  const cleanedHtml = cleanDescriptionHtml(detail.descriptionHtml);
  tooltip.innerHTML = `<h3>${detail.perkName || ""}</h3><div>${cleanedHtml}</div>`;
  tooltip.classList.add("visible");
  tooltip.setAttribute("aria-hidden", "false");
  moveTooltip(event.clientX, event.clientY);
}

function hideTooltip() {
  tooltip.classList.remove("visible");
  tooltip.setAttribute("aria-hidden", "true");
}

function getDetailByFile(fileName, details) {
  if (!fileName) return null;
  const keys = imageKeyVariants(fileName);
  for (const key of keys) {
    if (details[key]) return details[key];
  }
  return null;
}

async function loadData() {
  const [manifestRes, detailsRes, killersRes] = await Promise.all([
    fetch("/assets/killer_perks/manifest.json"),
    fetch("/killer-perks-data-2.json"),
    fetch("/assets/killers/manifest.json"),
  ]);

  if (!manifestRes.ok) {
    throw new Error("Failed to load assets/killer_perks/manifest.json");
  }
  if (!detailsRes.ok) {
    throw new Error("Failed to load killer-perks-data-2.json");
  }
  if (!killersRes.ok) {
    throw new Error("Failed to load assets/killers/manifest.json");
  }

  const manifest = await manifestRes.json();
  const detailsRaw = await detailsRes.json();
  const killersManifest = await killersRes.json();
  const detailsMap = {};

  (detailsRaw.perks || []).forEach((item) => {
    const imageName = String(item.imageName || "");
    if (!imageName) return;
    const payload = {
      perkName: item.perkName || "",
      descriptionHtml: item.descriptionHtml || "",
      descriptionText: item.descriptionText || "",
      imageName,
    };
    imageKeyVariants(imageName).forEach((key) => {
      detailsMap[key] = payload;
    });
  });

  return { manifest, detailsMap, killers: killersManifest.items || [] };
}

function toKillerDisplayName(file) {
  const base = String(file || "").replace(/\.png$/i, "");
  const withoutPrefix = base.replace(/^K\d+_/, "");
  const withoutSuffix = withoutPrefix.replace(/_Portrait$/i, "");
  return withoutSuffix
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function createKillerPicker(killerOptions, getTakenKillers) {
  const overlay = document.createElement("div");
  overlay.className = "killer-picker-overlay";
  overlay.setAttribute("aria-hidden", "true");

  const panel = document.createElement("div");
  panel.className = "killer-picker-panel";

  const title = document.createElement("h3");
  title.className = "killer-picker-title";
  title.textContent = "Select Killer";

  const strikeRow = document.createElement("label");
  strikeRow.className = "strike-toggle";
  const strikeCheckbox = document.createElement("input");
  strikeCheckbox.type = "checkbox";
  strikeCheckbox.className = "strike-toggle-input";
  const strikeText = document.createElement("span");
  strikeText.textContent = "STRIKE";
  strikeRow.appendChild(strikeCheckbox);
  strikeRow.appendChild(strikeText);

  const list = document.createElement("div");
  list.className = "killer-picker-list";

  panel.appendChild(title);
  panel.appendChild(strikeRow);
  panel.appendChild(list);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  let onPick = null;
  let currentSelection = { file: null, strike: false };

  function close() {
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    onPick = null;
  }

  function buildList(currentFile) {
    list.innerHTML = "";
    const taken = new Set(
      getTakenKillers()
        .map((entry) => entry?.file || null)
        .filter(Boolean)
    );

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "killer-option killer-option-none";
    if (!currentFile) clearBtn.classList.add("selected");
    clearBtn.innerHTML =
      '<span class="killer-option-none-icon">∅</span><span class="killer-option-name">None (clear selection)</span>';
    clearBtn.addEventListener("click", () => {
      onPick?.({ file: null, strike: false });
      close();
    });
    list.appendChild(clearBtn);

    killerOptions.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "killer-option";
      if (currentFile === opt.file) btn.classList.add("selected");
      const isTakenElsewhere = taken.has(opt.file) && currentFile !== opt.file;
      if (isTakenElsewhere) {
        btn.classList.add("taken");
        btn.disabled = true;
        btn.title = "Already selected in another group";
      }

      const thumb = document.createElement("img");
      thumb.className = "killer-option-thumb";
      thumb.src = `/assets/killers/${opt.file}`;
      thumb.alt = "";
      thumb.loading = "lazy";

      const name = document.createElement("span");
      name.className = "killer-option-name";
      name.textContent = opt.name;

      btn.appendChild(thumb);
      btn.appendChild(name);
      if (!isTakenElsewhere) {
        btn.addEventListener("click", () => {
          onPick?.({ file: opt.file, strike: strikeCheckbox.checked });
          close();
        });
      }
      list.appendChild(btn);
    });
  }

  overlay.addEventListener("click", (evt) => {
    if (evt.target === overlay) {
      if (onPick) {
        onPick({
          file: currentSelection?.file || null,
          strike: Boolean(strikeCheckbox.checked),
        });
      }
      close();
    }
  });

  return {
    open(selection, pickHandler) {
      onPick = pickHandler;
      const currentFile = selection?.file || null;
      strikeCheckbox.checked = Boolean(selection?.strike);
      currentSelection = {
        file: currentFile,
        strike: Boolean(selection?.strike),
      };
      buildList(currentFile);
      overlay.classList.add("open");
      overlay.setAttribute("aria-hidden", "false");
    },
  };
}

function buildSelectedKillersFromQuery(killerOptions, groupCount) {
  const defaults = new Array(groupCount)
    .fill(null)
    .map(() => ({ file: null, strike: false }));

  const params = new URLSearchParams(window.location.search);
  const raw = params.get(KILLERS_QUERY_PARAM);
  if (!raw) return defaults;

  const tokens = raw.split(".");
  const max = Math.min(tokens.length, groupCount);
  for (let i = 0; i < max; i += 1) {
    const token = tokens[i];
    if (!token || token === "_") continue;

    const hasStrike = token.endsWith("s");
    const indexPart = hasStrike ? token.slice(0, -1) : token;
    const index = Number.parseInt(indexPart, 10);
    if (Number.isNaN(index) || index < 0 || index >= killerOptions.length) continue;

    defaults[i] = {
      file: killerOptions[index].file,
      strike: hasStrike,
    };
  }

  return defaults;
}

function updateKillersQueryParam(selectedKillers, killerOptions) {
  const fileToIndex = Object.create(null);
  killerOptions.forEach((opt, index) => {
    fileToIndex[opt.file] = index;
  });

  const tokens = selectedKillers.map((entry) => {
    if (!entry?.file) return "_";
    const idx = fileToIndex[entry.file];
    if (idx === undefined) return "_";
    return `${idx}${entry.strike ? "s" : ""}`;
  });

  // Trim trailing empty groups for cleaner URLs.
  let end = tokens.length;
  while (end > 0 && tokens[end - 1] === "_") end -= 1;
  const compact = tokens.slice(0, end);

  const params = new URLSearchParams(window.location.search);
  if (compact.length === 0) {
    params.delete(KILLERS_QUERY_PARAM);
  } else {
    params.set(KILLERS_QUERY_PARAM, compact.join("."));
  }

  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);
}

function render(perks, detailsMap, killers) {
  const groups = [];
  let cursor = 0;
  for (const size of GROUP_SIZES) {
    if (cursor >= perks.length) break;
    groups.push(perks.slice(cursor, cursor + size));
    cursor += size;
  }
  if (cursor < perks.length) {
    groups.push(perks.slice(cursor));
  }

  const columns = 3;
  const rowCount = Math.ceil(groups.length / columns);
  grid.style.gridTemplateRows = `repeat(${rowCount}, minmax(0, 1fr))`;
  grid.style.setProperty("--group-row-count", String(rowCount));

  const killerOptions = killers
    .map((file) => ({
      file,
      name: toKillerDisplayName(file),
    }))
    .sort((a, b) =>
      a.name.replace(/^The\s+/i, "").localeCompare(
        b.name.replace(/^The\s+/i, ""),
        undefined,
        { sensitivity: "base" }
      )
    );
  const selectedKillers = buildSelectedKillersFromQuery(killerOptions, groups.length);
  const picker = createKillerPicker(killerOptions, () => selectedKillers);
  updateKillersQueryParam(selectedKillers, killerOptions);

  for (let gi = 0; gi < groups.length; gi += 1) {
    const group = groups[gi];
    const columnIndex = Math.floor(gi / rowCount);
    const rowIndex = gi % rowCount;
    const groupCard = document.createElement("article");
    groupCard.className = "group-card";
    groupCard.style.gridColumn = String(columnIndex + 1);
    groupCard.style.gridRow = String(rowIndex + 1);

    const counter = document.createElement("div");
    counter.className = "group-counter";
    counter.textContent = `${gi + 1}.`;
    groupCard.appendChild(counter);

    const addonPair = document.createElement("div");
    addonPair.className = "group-addons";
    const start = (gi * 2) % ADDON_ORDER.length;
    const pair = [
      ADDON_ORDER[start],
      ADDON_ORDER[(start + 1) % ADDON_ORDER.length],
    ];
    pair.forEach((name) => {
      const img = document.createElement("img");
      img.className = "group-addon";
      img.src = `/assets/addons/${name}.png`;
      img.alt = "";
      img.loading = "lazy";
      addonPair.appendChild(img);
    });
    groupCard.appendChild(addonPair);

    const perkTrack = document.createElement("div");
    perkTrack.className = "perk-track";

    for (let j = 0; j < 4; j++) {
      const perk = group[j];
      if (!perk) {
        const spacer = document.createElement("div");
        spacer.className = "perk-spacer";
        perkTrack.appendChild(spacer);
        continue;
      }

      const slot = document.createElement("div");
      slot.className = "perk";

      const img = document.createElement("img");
      img.src = `/assets/killer_perks/${perk.file}`;
      img.alt = "";
      img.loading = "lazy";

      slot.dataset.imageName = String(perk.file).toLowerCase();
      slot.addEventListener("mouseenter", function onEnter(evt) {
        const detail = getDetailByFile(this.dataset.imageName, detailsMap);
        if (detail) showTooltip(detail, evt);
      });
      slot.addEventListener("mousemove", (evt) => {
        if (tooltip.classList.contains("visible")) {
          moveTooltip(evt.clientX, evt.clientY);
        }
      });
      slot.addEventListener("mouseleave", hideTooltip);

      slot.appendChild(img);
      perkTrack.appendChild(slot);
    }
    const killerSlot = document.createElement("button");
    killerSlot.type = "button";
    killerSlot.className = "killer-slot is-empty";
    killerSlot.setAttribute("aria-label", "Select killer");

    function renderKiller(selection) {
      killerSlot.innerHTML = "";
      if (!selection?.file) {
        killerSlot.classList.add("is-empty");
        return;
      }
      killerSlot.classList.remove("is-empty");
      const killerImg = document.createElement("img");
      killerImg.className = "killer-image";
      killerImg.src = `/assets/killers/${selection.file}`;
      killerImg.alt = "";
      killerImg.loading = "lazy";
      killerSlot.appendChild(killerImg);

      if (selection.strike) {
        const strike = document.createElement("span");
        strike.className = "killer-strike";
        strike.textContent = "STRIKE";
        killerSlot.appendChild(strike);
      }
    }

    renderKiller(selectedKillers[gi]);
    killerSlot.addEventListener("click", () => {
      picker.open(selectedKillers[gi], (selection) => {
        selectedKillers[gi] = selection;
        renderKiller(selection);
        updateKillersQueryParam(selectedKillers, killerOptions);
      });
    });

    perkTrack.appendChild(killerSlot);
    groupCard.appendChild(perkTrack);

    grid.appendChild(groupCard);
  }
}

async function main() {
  try {
    const { manifest, detailsMap, killers } = await loadData();
    const getSortName = (item) => {
      const detail = getDetailByFile(item?.file, detailsMap);
      if (detail?.perkName) return detail.perkName;
      if (item?.name) return item.name;
      return item?.file || "";
    };

    const perks = (manifest.items || [])
      .filter((item) => {
        if (!item || !item.file) return false;
        const detail = getDetailByFile(item.file, detailsMap);
        if (!detail) return false;
        const hasDescriptionHtml = Boolean(String(detail.descriptionHtml || "").trim());
        const hasDescriptionText = Boolean(String(detail.descriptionText || "").trim());
        return hasDescriptionHtml || hasDescriptionText;
      })
      .slice()
      .sort((a, b) =>
        getSortName(a).localeCompare(getSortName(b), undefined, { sensitivity: "base" })
      );

    render(perks, detailsMap, killers);
  } catch (error) {
    console.error(error);
  }
}

main();
