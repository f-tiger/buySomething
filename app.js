// SourceRadar front-end logic: filtering, sorting, product modal, landed-cost calculator.
(function () {
  const grid = document.getElementById("productGrid");
  const chipsWrap = document.getElementById("trackChips");
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");
  const hideSaturated = document.getElementById("hideSaturated");
  const emptyState = document.getElementById("emptyState");
  const backdrop = document.getElementById("modalBackdrop");
  const modalBody = document.getElementById("modalBody");
  const modalClose = document.getElementById("modalClose");

  let activeTrack = "All Tracks";

  // Live Google Trends data (written daily by tools/fetch_trends.py via CI).
  // Absent file → graceful fallback to editorial grades only.
  let TRENDS = null;
  fetch("trends.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((t) => {
      if (!t || !t.products) return;
      TRENDS = t;
      const el = document.getElementById("trendsUpdated");
      if (el) el.textContent = "Live Google Trends: updated " + t.updated.slice(0, 10);
      renderGrid();
    })
    .catch(() => {});

  const MOMENTUM_LABELS = {
    rising: { arrow: "↗", cls: "mo-rising", word: "Rising" },
    stable: { arrow: "→", cls: "mo-stable", word: "Stable" },
    cooling: { arrow: "↘", cls: "mo-cooling", word: "Cooling" }
  };
  const trendOf = (p) => (TRENDS && TRENDS.products[p.id]) || null;
  const momentumBadge = (p) => {
    const t = trendOf(p);
    if (!t || !MOMENTUM_LABELS[t.label]) return "";
    const m = MOMENTUM_LABELS[t.label];
    const pct = t.momentum != null ? (t.momentum > 0 ? "+" : "") + Math.round(t.momentum * 100) + "%" : "";
    return `<span class="badge ${m.cls}" title="Google Trends momentum, last 14d vs prior 60d (${t.geo})">${m.arrow} ${m.word} ${pct}</span>`;
  };
  const sparkline = (points) => {
    if (!points || points.length < 2) return "";
    const w = 280, h = 48, max = Math.max(...points, 1);
    const pts = points.map((v, i) => `${((i / (points.length - 1)) * w).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`).join(" ");
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="90-day search interest">
      <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="${pts.split(" ").pop().split(",")[0]}" cy="${pts.split(" ").pop().split(",")[1]}" r="3" fill="currentColor"/>
    </svg>`;
  };
  const trendsUrl = (p) => {
    const t = trendOf(p);
    const geo = t ? t.geo : "US";
    return `https://trends.google.com/trends/explore?date=today%203-m&geo=${geo}&q=${encodeURIComponent(p.trendQuery)}`;
  };

  const mid = (range) => (range[0] + range[1]) / 2;
  const money = (n) => "$" + (n >= 100 ? Math.round(n) : n.toFixed(2).replace(/\.00$/, ""));
  const rangeStr = (r) => money(r[0]) + "–" + money(r[1]);
  // Indicative multiple: Western retail midpoint over 1688 factory midpoint.
  const spread = (p) => mid(p.retailPrice) / mid(p.price1688);

  // Header stats
  const statSpread = document.getElementById("statSpread");
  if (statSpread) {
    const avg = PRODUCTS.reduce((s, p) => s + spread(p), 0) / PRODUCTS.length;
    statSpread.textContent = "×" + avg.toFixed(1);
  }
  const statCount = document.getElementById("statCount");
  if (statCount) statCount.textContent = PRODUCTS.length;
  const statTracks = document.getElementById("statTracks");
  if (statTracks) statTracks.textContent = TRACKS.length - 1;

  function renderChips() {
    chipsWrap.innerHTML = "";
    TRACKS.forEach((t) => {
      const b = document.createElement("button");
      b.className = "chip" + (t === activeTrack ? " active" : "");
      b.textContent = t;
      b.onclick = () => { activeTrack = t; renderChips(); renderGrid(); };
      chipsWrap.appendChild(b);
    });
  }

  function filtered() {
    const q = searchInput.value.trim().toLowerCase();
    let list = PRODUCTS.filter((p) => {
      if (activeTrack !== "All Tracks" && p.track !== activeTrack) return false;
      if (hideSaturated.checked && p.lifecycle === "saturated") return false;
      if (!q) return true;
      const hay = [
        p.name, p.track, p.cnKeyword, p.whyHot, p.buyerTip, p.chinaSignal, p.risks,
        p.signals.join(" "), p.compliance.us.join(" "), p.compliance.eu.join(" ")
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
    const sort = sortSelect.value;
    if (sort === "trend") list.sort((a, b) => b.trendScore - a.trendScore);
    else if (sort === "spread") list.sort((a, b) => spread(b) - spread(a));
    else if (sort === "priceAsc") list.sort((a, b) => mid(a.price1688) - mid(b.price1688));
    else if (sort === "moq") list.sort((a, b) => a.moq - b.moq);
    return list;
  }

  function renderGrid() {
    const list = filtered();
    emptyState.hidden = list.length > 0;
    grid.innerHTML = "";
    list.forEach((p) => {
      const lc = LIFECYCLE_LABELS[p.lifecycle];
      const tier = TIER_LABELS[p.tier];
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `
        <div class="card-top">
          <div class="card-emoji">${p.emoji}</div>
          <div>
            <h3 class="card-title">${p.name}</h3>
            <p class="card-track">${p.track} · MOQ ${p.moq}</p>
          </div>
        </div>
        <div class="trend-row">
          <div class="trend-bar"><div class="trend-fill" style="width:${p.trendScore}%"></div></div>
          <span class="trend-num">🔥 ${p.trendScore}</span>
        </div>
        <div class="card-prices">
          <div class="price-block"><span class="price-label">1688 factory</span><span class="price-value tier1688">${rangeStr(p.price1688)}</span></div>
          <div class="price-block"><span class="price-label">Alibaba</span><span class="price-value">${rangeStr(p.priceAlibaba)}</span></div>
          <div class="price-block"><span class="price-label">US/EU retail</span><span class="price-value retail">${rangeStr(p.retailPrice)}</span></div>
          <div class="price-block"><span class="price-label">Spread</span><span class="margin-value">×${spread(p).toFixed(1)}</span></div>
        </div>
        <div class="card-badges">
          <span class="badge ${lc.cls}">${lc.label}</span>
          ${momentumBadge(p)}
          <span class="badge ${tier.cls}">${tier.label}</span>
          <span class="badge">🛃 cert complexity: ${p.compliance.difficulty}</span>
        </div>`;
      card.onclick = () => openModal(p);
      grid.appendChild(card);
    });
  }

  function openModal(p) {
    const lc = LIFECYCLE_LABELS[p.lifecycle];
    const tier = TIER_LABELS[p.tier];
    const certList = (arr) => arr.length ? arr.map((c) => `<span class="badge">${c}</span>`).join(" ") : '<span class="badge">Not targeted</span>';
    modalBody.innerHTML = `
      <div class="modal-head">
        <div class="modal-emoji">${p.emoji}</div>
        <div>
          <h3 class="modal-title" id="modalTitle">${p.name}</h3>
          <p class="modal-track">${p.track} · <span class="badge ${lc.cls}">${lc.label}</span> <span class="badge ${tier.cls}">${tier.label}</span></p>
        </div>
      </div>

      <div class="facts">
        <div class="fact"><div class="fact-label">1688 factory (EXW)</div><div class="fact-value tier1688">${rangeStr(p.price1688)}</div></div>
        <div class="fact"><div class="fact-label">Alibaba listing</div><div class="fact-value">${rangeStr(p.priceAlibaba)}</div></div>
        <div class="fact"><div class="fact-label">US/EU retail</div><div class="fact-value retail">${rangeStr(p.retailPrice)}</div></div>
        <div class="fact"><div class="fact-label">Typical MOQ</div><div class="fact-value">${p.moq} units</div></div>
        <div class="fact"><div class="fact-label">Season window</div><div class="fact-value">${p.season}</div></div>
        <div class="fact"><div class="fact-label">Order by</div><div class="fact-value">${p.orderBy}</div></div>
      </div>

      <div class="modal-section">
        <h4>🇨🇳 China-first signal</h4>
        <p>${p.chinaSignal}</p>
        <p class="cn-keyword">1688 search term: <code>${p.cnKeyword}</code>
          <button class="copy-btn" data-copy="${p.cnKeyword}">Copy</button></p>
      </div>

      <div class="modal-section">
        <h4>📊 Live demand check — Google Trends</h4>
        ${(() => {
          const t = trendOf(p);
          if (t) {
            const m = MOMENTUM_LABELS[t.label] || { arrow: "•", cls: "", word: "—" };
            const pct = t.momentum != null ? (t.momentum > 0 ? "+" : "") + Math.round(t.momentum * 100) + "%" : "n/a";
            return `<div class="spark-row ${m.cls}">${sparkline(t.points)}
              <div class="spark-meta">
                <span class="badge ${m.cls}">${m.arrow} ${m.word} ${pct}</span>
                <span class="spark-note">last 14d vs prior 60d · geo ${t.geo} · updated ${TRENDS.updated.slice(0, 10)}</span>
              </div></div>`;
          }
          return `<p class="spark-note">Live trend data pending first pipeline run — editorial grade only for now.</p>`;
        })()}
        <p class="spark-note">Verify it yourself: <a class="ext-link" href="${trendsUrl(p)}" target="_blank" rel="noopener">"${p.trendQuery}" on Google Trends ↗</a></p>
      </div>

      <div class="modal-section">
        <h4>📈 Demand signals</h4>
        <div class="taglist">${p.signals.map((s) => `<span class="badge">${s}</span>`).join(" ")}</div>
        <p style="margin-top:8px">${p.whyHot}</p>
      </div>

      <div class="modal-section">
        <h4>🛃 Compliance snapshot (${p.compliance.difficulty} complexity)</h4>
        <p><strong>US:</strong></p><div class="taglist">${certList(p.compliance.us)}</div>
        <p style="margin-top:6px"><strong>EU:</strong></p><div class="taglist">${certList(p.compliance.eu)}</div>
        <p style="margin-top:8px">${p.compliance.note}</p>
        <p class="spark-note" style="margin-top:8px">Importing this category typically involves the certifications above; requirements vary by state and member state. Verify supplier certificates and your local import requirements independently — as the importer of record, compliance responsibility is yours.</p>
      </div>

      <div class="modal-section">
        <h4>🧮 Landed cost & margin calculator (US)</h4>
        <div class="calc">
          <div class="calc-grid">
            <div class="calc-field"><label>Order qty</label><input type="number" id="cQty" value="${p.moq}" min="1"></div>
            <div class="calc-field"><label>EXW unit $ </label><input type="number" id="cExw" value="${mid(p.price1688).toFixed(2)}" step="0.1" min="0"></div>
            <div class="calc-field"><label>Freight $/unit</label><input type="number" id="cFreight" value="${p.freightUnit}" step="0.1" min="0"></div>
            <div class="calc-field"><label>Tariff %</label><input type="number" id="cTariff" value="${Math.round(p.tariffUS * 100)}" step="1" min="0"></div>
            <div class="calc-field"><label>Target retail $</label><input type="number" id="cRetail" value="${mid(p.retailPrice).toFixed(2)}" step="0.5" min="0"></div>
          </div>
          <div class="calc-results">
            <div class="calc-result"><span class="r-label">Landed $/unit</span><span class="r-value" id="rLanded">—</span></div>
            <div class="calc-result"><span class="r-label">Landed multiple</span><span class="r-value" id="rMultiple">—</span></div>
            <div class="calc-result"><span class="r-label">Gross margin</span><span class="r-value" id="rMargin">—</span></div>
            <div class="calc-result"><span class="r-label">Total order cost</span><span class="r-value" id="rTotal">—</span></div>
          </div>
          <p class="calc-note">Landed = EXW × (1 + tariff) + freight + 5% misc (MPF/HMF, brokerage, insurance). Forum rule of thumb: retail ≥ EXW × 4–5 to survive ads, returns and platform fees. Indicative only — confirm HS-code rates with your broker.</p>
        </div>
      </div>

      <div class="modal-section">
        <h4>🚢 Logistics</h4>
        <p>${p.freightMode}</p>
      </div>

      <div class="modal-section">
        <h4>⚠️ Risk notes</h4>
        <p>${p.risks}</p>
      </div>

      <div class="modal-section">
        <h4>💡 Buyer tip</h4>
        <p>${p.buyerTip}</p>
      </div>`;

    const recalc = () => {
      const qty = Math.max(1, +document.getElementById("cQty").value || 1);
      const exw = +document.getElementById("cExw").value || 0;
      const freight = +document.getElementById("cFreight").value || 0;
      const tariff = (+document.getElementById("cTariff").value || 0) / 100;
      const retail = +document.getElementById("cRetail").value || 0;
      const landed = exw * (1 + tariff) + freight;
      const landedFull = landed * 1.05;
      const margin = retail > 0 ? (retail - landedFull) / retail : 0;
      document.getElementById("rLanded").textContent = money(landedFull);
      document.getElementById("rMultiple").textContent = exw > 0 ? "×" + (landedFull / exw).toFixed(2) : "—";
      const mEl = document.getElementById("rMargin");
      mEl.textContent = (margin * 100).toFixed(0) + "%";
      mEl.className = "r-value " + (margin >= 0.6 ? "good" : margin >= 0.4 ? "" : "bad");
      document.getElementById("rTotal").textContent = money(landedFull * qty);
    };
    modalBody.querySelectorAll(".calc input").forEach((inp) => inp.addEventListener("input", recalc));
    recalc();

    modalBody.querySelectorAll(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        navigator.clipboard && navigator.clipboard.writeText(btn.dataset.copy).then(() => {
          btn.textContent = "Copied ✓";
          setTimeout(() => (btn.textContent = "Copy"), 1500);
        });
      });
    });

    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    backdrop.hidden = true;
    document.body.style.overflow = "";
  }

  modalClose.onclick = closeModal;
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !backdrop.hidden) closeModal(); });

  searchInput.addEventListener("input", renderGrid);
  sortSelect.addEventListener("change", renderGrid);
  hideSaturated.addEventListener("change", renderGrid);

  renderChips();
  renderGrid();
})();
