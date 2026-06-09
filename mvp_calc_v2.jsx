import React, { useState, useMemo } from "react";
import { Calculator, Layers, Package, FlaskConical, FilePlus2, ChevronDown, ChevronRight, Ruler, AlertTriangle } from "lucide-react";

/* ============================================================
   КАЛЬКУЛЯТОР ЗАКУПЩИКА — MVP v2 (РЕАЛЬНЫЕ ДАННЫЕ)
   Источники:
   · «База. тканей» (Google Sheets) — 36 рёбер ткань×поставщик,
     2 поставщика (МЕДАС, КОТОНПРОМ), цены ₽ и $
   · «SKU / PRODUCT_PASSPORT» — 50 паспортов, норматив в м/изд
   Допущения (помечены ≈ в интерфейсе):
   · ширина полотна — дефолт по категории (в базе пусто)
   · потери производства — дефолт 7% (в паспортах нет)
   · усадка — дефолт по категории
   · кратность рулона — дефолт 25 кг
   BOM v1: одна ткань на изделие (как в базе)
   ============================================================ */

// ---------- РАЗМЕРЫ ----------
const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const SIZE_COEF = { XS: 0.85, S: 0.92, M: 1.0, L: 1.09, XL: 1.18, XXL: 1.28 }; // M ≈ AVG базы
const REF_WIDTH = 180;

// ---------- ДЕФОЛТЫ ПО КАТЕГОРИЯМ (≈ допущения) ----------
const CAT_DEFAULTS = {
  "Кулирка":  { width: 180, shrink: 0.05 },
  "Футер":    { width: 180, shrink: 0.06 },
  "Пике":     { width: 180, shrink: 0.05 },
  "Рибана":   { width: 90,  shrink: 0.05 },
  "Кашкорсе": { width: 90,  shrink: 0.05 },
};
const DEFAULT_ROLL_KG = 25;
const DEFAULT_LOSS = 0.07; // раскрой+пошив, ≈

// ---------- БАЗА ТКАНЕЙ (из «База. тканей», FabricSupplierPrices) ----------
// f: [fabric_base_id, name, category, composition, density_gsm]
const FABRICS = {
  FAB001: { name: "Футер 3-х нитка Начес", cat: "Футер", comp: "70/30 хб/пэ", den: 320 },
  FAB002: { name: "Футер 3-х нитка Петля", cat: "Футер", comp: "80/20 хб/пэ", den: 320 },
  FAB003: { name: "Кулирка", cat: "Кулирка", comp: "92/8 хб/лайкра", den: 165 },
  FAB004: { name: "Кулирка", cat: "Кулирка", comp: "92/8 хб/лайкра", den: 180 },
  FAB005: { name: "Кулирка", cat: "Кулирка", comp: "92/8 хб/лайкра", den: 200 },
  FAB006: { name: "Кулирка", cat: "Кулирка", comp: "92/8 хб/лайкра", den: 230 },
  FAB007: { name: "Кулирка", cat: "Кулирка", comp: "92/8 хб/лайкра", den: 240 },
  FAB008: { name: "Кулирка", cat: "Кулирка", comp: "100% хб", den: 180 },
  FAB009: { name: "Кулирка", cat: "Кулирка", comp: "100% хб", den: 200 },
  FAB010: { name: "Кулирка", cat: "Кулирка", comp: "100% хб", den: 230 },
  FAB011: { name: "Кулирка", cat: "Кулирка", comp: "100% хб", den: 250 },
  FAB012: { name: "Кулирка", cat: "Кулирка", comp: "100% хб", den: 300 },
  FAB013: { name: "Футер 2-х нитка", cat: "Футер", comp: "92/8 хб/лайкра", den: 245 },
  FAB014: { name: "Петля/Диагональ", cat: "Футер", comp: "80/20 хб/пэ", den: 320 },
  FAB015: { name: "Петля/Диагональ", cat: "Футер", comp: "80/20 хб/пэ", den: 350 },
  FAB016: { name: "Петля/Диагональ", cat: "Футер", comp: "80/20 хб/пэ", den: 400 },
  FAB017: { name: "Петля/Диагональ", cat: "Футер", comp: "80/20 хб/пэ", den: 470 },
  FAB018: { name: "Петля/Диагональ", cat: "Футер", comp: "80/20 хб/пэ", den: 500 },
  FAB020: { name: "Начёс/интерсофт", cat: "Футер", comp: "65/35 хб/пэ", den: 320 },
  FAB024: { name: "Пике", cat: "Пике", comp: "100% хб", den: 190 },
  FAB026: { name: "Пике", cat: "Пике", comp: "100% хб", den: 215 },
  FAB027: { name: "Пике", cat: "Пике", comp: "93/7 хб/лайкра", den: 320 },
  FAB033: { name: "Рибана", cat: "Рибана", comp: "", den: 220 },
  FAB034: { name: "Кашкорсе", cat: "Кашкорсе", comp: "", den: 220 },
};

const SUPPLIERS = { SUP001: "МЕДАС", SUP002: "КОТОНПРОМ" };

// рёбра: fab → [{sup, rub, usd}]
const EDGES = {
  FAB001: [{ sup: "SUP001", rub: 543.2, usd: 5.9 }, { sup: "SUP002", rub: 535.4, usd: 5.8 }],
  FAB002: [{ sup: "SUP001", rub: 580.5, usd: 6.3 }, { sup: "SUP002", rub: 555.7, usd: 6.0 }],
  FAB003: [{ sup: "SUP001", rub: 316.2, usd: 3.4 }, { sup: "SUP002", rub: 317.4, usd: 3.5 }],
  FAB004: [{ sup: "SUP002", rub: 320.0, usd: 3.5 }],
  FAB005: [{ sup: "SUP001", rub: 371.5, usd: 4.0 }, { sup: "SUP002", rub: 343.2, usd: 3.7 }],
  FAB006: [{ sup: "SUP001", rub: 441.3, usd: 4.8 }],
  FAB007: [{ sup: "SUP001", rub: 210.0, usd: 2.3 }],
  FAB008: [{ sup: "SUP001", rub: 308.1, usd: 3.3 }, { sup: "SUP002", rub: 300.8, usd: 3.3 }],
  FAB009: [{ sup: "SUP001", rub: 371.5, usd: 4.0 }, { sup: "SUP002", rub: 343.2, usd: 3.7 }],
  FAB010: [{ sup: "SUP002", rub: 401.1, usd: 4.4 }],
  FAB011: [{ sup: "SUP001", rub: 503.7, usd: 5.5 }],
  FAB012: [{ sup: "SUP001", rub: 686.0, usd: 7.5 }, { sup: "SUP002", rub: 520.7, usd: 5.7 }],
  FAB013: [{ sup: "SUP001", rub: 458.0, usd: 5.0 }, { sup: "SUP002", rub: 451.7, usd: 4.9 }],
  FAB014: [{ sup: "SUP001", rub: 580.5, usd: 6.3 }],
  FAB015: [{ sup: "SUP002", rub: 555.7, usd: 6.0 }],
  FAB016: [{ sup: "SUP002", rub: 761.8, usd: 8.3 }],
  FAB017: [{ sup: "SUP001", rub: 1107.3, usd: 12.0 }],
  FAB018: [{ sup: "SUP002", rub: 991.8, usd: 10.8 }],
  FAB020: [{ sup: "SUP002", rub: 552.0, usd: 6.0 }],
  FAB024: [{ sup: "SUP001", rub: 443.1, usd: 4.8 }],
  FAB026: [{ sup: "SUP002", rub: 396.5, usd: 4.3 }],
  FAB027: [{ sup: "SUP002", rub: 1104.0, usd: 12.0 }],
  FAB033: [{ sup: "SUP001", rub: 516.9, usd: 5.6 }, { sup: "SUP002", rub: 1002.8, usd: 10.9 }],
  FAB034: [{ sup: "SUP001", rub: 573.8, usd: 6.2 }, { sup: "SUP002", rub: 1002.8, usd: 10.9 }],
};

// ---------- БАЗА SKU (PRODUCT_PASSPORT) ----------
// [id, name, norm_m, fabric_label, matched_fab_id|null]
const PASSPORTS = [
  ["SKU001", "Футболка Classic woman", 0.80, "Кулирка(92/8) 240", "FAB007"],
  ["SKU002", "Футболка Classic man", 0.80, "Кулирка(92/8) 200", "FAB005"],
  ["SKU003", "Футболка Regular", 0.80, "Футер 2-х нитка(92/8) 240-250", "FAB013"],
  ["SKU004", "Футболка Free Fit", 0.90, "Кулирка(100) 230", "FAB010"],
  ["SKU005", "Футболка Oversize", 1.00, "Кулирка(100) 180", "FAB008"],
  ["SKU006", "Футболка OversizeCrop", 1.00, "Кулирка(100) 200", "FAB009"],
  ["SKU007", "Лонгслив Classic woman", 0.80, "Кулирка(92/8) 180", "FAB004"],
  ["SKU008", "Лонгслив Regular", 1.30, "Кулирка(92/8) 200", "FAB005"],
  ["SKU009", "Лонгслив Free Fit", 1.30, "Кулирка(100) 200", "FAB009"],
  ["SKU010", "Лонгслив Oversize", 1.40, "Футер 2-х нитка(92/8) 240-250", "FAB013"],
  ["SKU011", "Свитшот Classic", 1.30, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU012", "Свитшот Regular", 1.30, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU013", "Свитшот Free Fit", 1.30, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU014", "Свитшот Oversize", 1.30, "Петля/Диагональ(100) 340", null],
  ["SKU015", "Худи Classic", 1.40, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU016", "Худи Regular", 1.40, "Петля/Диагональ(80/20) 350", "FAB015"],
  ["SKU017", "Худи Free Fit", 1.40, "Петля/Диагональ(80/20) 350", "FAB015"],
  ["SKU018", "Худи Oversize", 1.50, "Петля/Диагональ(80/20) 400", "FAB016"],
  ["SKU019", "Худи Reglan", 1.50, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU020", "Поло Regular", 0.80, "Пике(100) 180", null],
  ["SKU021", "Поло Oversize", 0.90, "Пике(100) 180", null],
  ["SKU022", "Регбийка Regular", 1.00, "Пике(100) 180", null],
  ["SKU023", "Регбийка Oversize", 1.00, "Пике(100) 180", null],
  ["SKU024", "Свитшот халф зип Regular", 1.20, "Петля/Диагональ(80/20) 400", "FAB016"],
  ["SKU025", "Свитшот халф зип Free Fit", 1.20, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU026", "Свитшот халф зип Oversize", 1.30, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU027", "Свитшот халф зип Regular без пояса", 1.20, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU028", "Свитшот халф зип Free Fit без пояса", 1.30, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU029", "Свитшот халф зип Oversize без пояса", 1.40, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU030", "Олимпийка Free Fit", 1.20, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU031", "Зип худи Regular", 1.30, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU032", "Зип худи Free Fit", 1.40, "Петля/Диагональ(80/20) 350", "FAB015"],
  ["SKU033", "Зип худи Oversize", 1.40, "Петля/Диагональ(80/20) 350", "FAB015"],
  ["SKU034", "Зип худи Regular капюшон-стойка", 1.40, "Петля/Диагональ(80/20) 400", "FAB016"],
  ["SKU035", "Зип худи Free Fit капюшон-стойка", 1.40, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU036", "Зип худи Oversize капюшон-стойка", 1.40, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU037", "Брюки woman Regular", 1.20, "Петля/Диагональ(80/20) 350", "FAB015"],
  ["SKU038", "Брюки woman Regular отрезной пояс", 1.30, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU039", "Брюки man Regular", 1.20, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU040", "Брюки man Regular отрезной пояс", 1.30, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU041", "Брюки man Free Fit", 1.30, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU042", "Брюки man Free Fit отрезной пояс", 1.30, "Петля/Диагональ(80/20) 400", "FAB016"],
  ["SKU043", "Бомбер basic на кнопках", 1.30, "Начёс/интерсофт 320", "FAB020"],
  ["SKU044", "Бомбер-zipped на молнии", 1.30, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU045", "Шорты woman", 0.90, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU046", "Шорты man", 1.00, "Петля/Диагональ(80/20) 320", "FAB014"],
  ["SKU047", "Шоппер Classic Bag", 0.90, "Саржа(100) 260", null],
  ["SKU048", "Шоппер Composite bag", 0.90, "Канвас 260", null],
  ["SKU049", "Шоппер Contraction bag", 0.90, "Саржа(100) 260", null],
  ["SKU050", "Шоппер Horizontal bag", 0.90, "Саржа(100) 270", null],
];

// ---------- ДВИЖОК ----------
function fabricProps(fabId) {
  const f = FABRICS[fabId];
  const d = CAT_DEFAULTS[f.cat] || { width: 180, shrink: 0.05 };
  return { ...f, width: d.width, shrink: d.shrink };
}
function kgPerM(width, den) { return (width / 100) * den / 1000; }
function perekos(qty) {
  const total = SIZES.reduce((a, s) => a + (qty[s] || 0), 0);
  if (!total) return 1;
  const maxShare = Math.max(...SIZES.map((s) => (qty[s] || 0) / total));
  return maxShare > 0.5 ? 1 + (maxShare - 0.5) * 0.1 : 1;
}

function compute({ passport, qty, supplierIdx, reservePct, fxRate, useUsd }) {
  const [, , norm, , fabId] = passport;
  if (!fabId) return { unmatched: true };
  const f = fabricProps(fabId);
  const edges = EDGES[fabId];
  const edge = edges[Math.min(supplierIdx, edges.length - 1)];

  const totalPieces = SIZES.reduce((a, s) => a + (qty[s] || 0), 0);
  const sumUnits = SIZES.reduce((a, s) => a + (qty[s] || 0) * SIZE_COEF[s], 0);

  const raw_m = norm * sumUnits;                       // шаг 1: норматив(м) × Σ(коэф×шт)
  const pEff = perekos(qty);
  const wEff = REF_WIDTH / f.width;                    // ширина: норматив задан в метрах
  const net_m = raw_m * pEff * wEff * (1 + DEFAULT_LOSS) * (1 + f.shrink); // шаг 2

  const klm = kgPerM(f.width, f.den);
  const net_kg = net_m * klm;                          // конверсия м→кг

  const reserve_kg = net_kg * reservePct;              // шаг 5
  const toBuy_kg = net_kg * (1 + reservePct);
  const order_kg = Math.ceil(toBuy_kg / DEFAULT_ROLL_KG) * DEFAULT_ROLL_KG; // шаг 6
  const order_m = klm > 0 ? order_kg / klm : 0;
  const rolls = Math.round(order_kg / DEFAULT_ROLL_KG);

  const pricePerKg = useUsd ? edge.usd * fxRate : edge.rub;
  const cost = order_kg * pricePerKg;                  // шаг 7

  return {
    f, fabId, edge, edges, totalPieces,
    raw_m, pEff, wEff, net_m, net_kg, klm,
    reserve_kg, toBuy_kg, order_kg, order_m, rolls,
    pricePerKg, cost,
  };
}

// ---------- UI ----------
const fmt = (n, d = 2) => (isFinite(n) ? n : 0).toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d });
const rub = (n) => fmt(n, 0) + " ₽";

const C = { paper: "#f1ece0", ink: "#1b1a12", accent: "#cc3b16", line: "#cabfa8", muted: "#6c6453", panel: "#faf6ec", chip: "#e7e0cf", warn: "#9a6b00", warnBg: "#f6ead0" };
const mono = "'IBM Plex Mono', ui-monospace, monospace";
const sans = "'IBM Plex Sans', system-ui, sans-serif";
const disp = "'Archivo', system-ui, sans-serif";

function Panel({ title, icon, children, right }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, background: C.panel, borderRadius: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${C.line}` }}>
        {icon}
        <span style={{ fontFamily: disp, fontWeight: 700, fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase" }}>{title}</span>
        <div style={{ marginLeft: "auto" }}>{right}</div>
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
}
function Metric({ label, v, big, accent }) {
  return (
    <div>
      <div style={{ fontFamily: sans, fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontFamily: mono, fontWeight: big ? 600 : 500, fontSize: big ? 16 : 13, color: accent ? C.accent : C.ink, marginTop: 2 }}>{v}</div>
    </div>
  );
}
function Row({ k, v, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", borderTop: bold ? `1px solid ${C.line}` : "none", marginTop: bold ? 3 : 0, fontWeight: bold ? 600 : 400, fontFamily: mono, fontSize: 11.5 }}>
      <span style={{ color: bold ? C.ink : C.muted }}>{k}</span><span>{v}</span>
    </div>
  );
}

export default function App() {
  const [skuIdx, setSkuIdx] = useState(17); // Худи Oversize
  const [qty, setQty] = useState({ M: 40, L: 30, XL: 20 });
  const [supplierIdx, setSupplierIdx] = useState(0);
  const [reservePct, setReservePct] = useState(0.05);
  const [fxRate, setFxRate] = useState(92);
  const [useUsd, setUseUsd] = useState(false);
  const [openBreak, setOpenBreak] = useState(false);
  const [orders, setOrders] = useState([]);

  const passport = PASSPORTS[skuIdx];
  const r = useMemo(
    () => compute({ passport, qty, supplierIdx, reservePct, fxRate, useUsd }),
    [passport, qty, supplierIdx, reservePct, fxRate, useUsd]
  );

  const inputStyle = { fontFamily: mono, fontSize: 14, padding: "7px 9px", border: `1px solid ${C.line}`, borderRadius: 3, background: "#fff", color: C.ink, width: "100%", boxSizing: "border-box" };
  const labelStyle = { fontFamily: sans, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, display: "block" };

  function createOrder() {
    if (r.unmatched || !r.totalPieces) return;
    setOrders((o) => [{ id: o.length + 1, sku: passport[1], pieces: r.totalPieces, kg: r.order_kg, cost: r.cost, sup: SUPPLIERS[r.edge.sup] }, ...o]);
  }

  return (
    <div style={{ background: C.paper, minHeight: "100vh", color: C.ink, fontFamily: sans, backgroundImage: "linear-gradient(rgba(0,0,0,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.025) 1px, transparent 1px)", backgroundSize: "26px 26px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        input:focus,select:focus{outline:2px solid ${C.accent};outline-offset:-1px} select{appearance:none;-webkit-appearance:none}`}</style>

      <div style={{ borderBottom: `2px solid ${C.ink}`, padding: "16px 22px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 38, height: 38, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4 }}>
          <Calculator size={22} color="#fff" />
        </div>
        <div>
          <div style={{ fontFamily: disp, fontWeight: 800, fontSize: 20 }}>КАЛЬКУЛЯТОР ЗАКУПЩИКА</div>
          <div style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>MVP v2 · реальные базы: 24 ткани · 36 цен · 50 SKU · МЕДАС + КОТОНПРОМ</div>
        </div>
        <div style={{ marginLeft: "auto", fontFamily: mono, fontSize: 10.5, color: C.muted, textAlign: "right" }}>≈ — дефолтные допущения<br />(ширина, потери, усадка, рулон)</div>
      </div>

      <div style={{ display: "flex", gap: 18, padding: 22, flexWrap: "wrap", alignItems: "flex-start" }}>
        {/* ВВОД */}
        <div style={{ flex: "1 1 380px", minWidth: 340, display: "flex", flexDirection: "column", gap: 18 }}>
          <Panel title="Изделие и партия" icon={<Layers size={16} color={C.accent} />}>
            <label style={labelStyle}>Модель (SKU) — из базы PRODUCT_PASSPORT</label>
            <select style={{ ...inputStyle, marginBottom: 6 }} value={skuIdx} onChange={(e) => { setSkuIdx(+e.target.value); setSupplierIdx(0); }}>
              {PASSPORTS.map((p, i) => (
                <option key={p[0]} value={i}>{p[0]} · {p[1]}{p[4] ? "" : " — ⚠ ткани нет в базе"}</option>
              ))}
            </select>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, marginBottom: 14 }}>
              ткань паспорта: {passport[3]} · норматив {fmt(passport[2], 2)} м/изд (база AVG)
            </div>

            <label style={labelStyle}>Количество по размерам</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6 }}>
              {SIZES.map((s) => (
                <div key={s}>
                  <div style={{ fontFamily: mono, fontSize: 10, color: C.muted, textAlign: "center", marginBottom: 2 }}>{s}</div>
                  <input style={{ ...inputStyle, textAlign: "center", padding: "6px 2px" }} type="number" min="0"
                    value={qty[s] || ""} onChange={(e) => setQty({ ...qty, [s]: parseInt(e.target.value) || 0 })} />
                </div>
              ))}
            </div>
          </Panel>

          {!r.unmatched && (
            <Panel title="Ткань и поставщик" icon={<Ruler size={16} color={C.accent} />}>
              <div style={{ fontFamily: mono, fontSize: 12, marginBottom: 10 }}>
                <b>{r.f.name}</b> {r.f.comp && `· ${r.f.comp}`} · {r.f.den} г/м² · ширина ≈{r.f.width} см
              </div>
              <label style={labelStyle}>Поставщик (цена за кг из базы)</label>
              <select style={{ ...inputStyle, marginBottom: 12 }} value={supplierIdx} onChange={(e) => setSupplierIdx(+e.target.value)}>
                {r.edges.map((e2, i) => (
                  <option key={e2.sup} value={i}>{SUPPLIERS[e2.sup]} — {fmt(e2.rub, 1)} ₽/кг · ${fmt(e2.usd, 1)}/кг</option>
                ))}
              </select>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Резерв</label>
                  <select style={inputStyle} value={reservePct} onChange={(e) => setReservePct(parseFloat(e.target.value))}>
                    {[0, 0.03, 0.05, 0.07, 0.1].map((x) => <option key={x} value={x}>{fmt(x * 100, 0)}%</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Валюта цены</label>
                  <select style={inputStyle} value={useUsd ? 1 : 0} onChange={(e) => setUseUsd(!!+e.target.value)}>
                    <option value={0}>₽ из базы</option>
                    <option value={1}>$ × курс</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Курс $→₽</label>
                  <input style={{ ...inputStyle, opacity: useUsd ? 1 : 0.45 }} type="number" value={fxRate} disabled={!useUsd}
                    onChange={(e) => setFxRate(parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            </Panel>
          )}
        </div>

        {/* РЕЗУЛЬТАТ */}
        <div style={{ flex: "1 1 420px", minWidth: 360, display: "flex", flexDirection: "column", gap: 18 }}>
          {r.unmatched ? (
            <Panel title="Ткань не найдена в базе" icon={<AlertTriangle size={16} color={C.warn} />}>
              <div style={{ background: C.warnBg, border: `1px solid ${C.warn}`, borderRadius: 4, padding: 12, fontFamily: mono, fontSize: 12, color: C.warn }}>
                Паспорт {passport[0]} ссылается на «{passport[3]}», которой нет в «Базе тканей».
                Расчёт пропущен по принятому правилу. Чтобы посчитать — добавь ткань в базу
                (Саржа, Канвас, Пике 180, Петля/Диагональ(100) 340).
              </div>
            </Panel>
          ) : (
            <Panel title="Итог к закупке" icon={<Package size={16} color={C.accent} />}
              right={<span style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>{r.totalPieces} шт</span>}>
              {!r.totalPieces ? (
                <div style={{ fontFamily: mono, fontSize: 13, color: C.muted, padding: "20px 0", textAlign: "center" }}>введите количество по размерам →</div>
              ) : (
                <>
                  <div style={{ border: `1px solid ${C.line}`, borderRadius: 4, marginBottom: 12, overflow: "hidden" }}>
                    <div style={{ background: C.chip, padding: "8px 12px", display: "flex", gap: 8, alignItems: "center" }}>
                      <Ruler size={13} color={C.accent} />
                      <span style={{ fontFamily: disp, fontWeight: 700, fontSize: 13 }}>{r.f.name} {r.f.den}</span>
                      <span style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, marginLeft: "auto" }}>{SUPPLIERS[r.edge.sup]}</span>
                    </div>
                    <div style={{ padding: "10px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px" }}>
                      <Metric label="Потребность" v={`${fmt(r.net_kg)} кг · ${fmt(r.net_m)} м`} />
                      <Metric label={`Резерв ${fmt(reservePct * 100, 0)}%`} v={`${fmt(r.reserve_kg)} кг`} />
                      <Metric label={`Закупка (${r.rolls} рул × ≈${DEFAULT_ROLL_KG} кг)`} v={`${fmt(r.order_kg)} кг · ${fmt(r.order_m)} м`} big />
                      <Metric label={`Стоимость (${fmt(r.pricePerKg, 1)} ₽/кг)`} v={rub(r.cost)} big accent />
                    </div>
                  </div>
                  <div style={{ borderTop: `2px solid ${C.ink}`, paddingTop: 12, display: "flex", alignItems: "baseline" }}>
                    <span style={{ fontFamily: disp, fontWeight: 800, fontSize: 14, textTransform: "uppercase" }}>Итого закупка</span>
                    <span style={{ marginLeft: "auto", fontFamily: mono, fontWeight: 600, fontSize: 22, color: C.accent }}>{rub(r.cost)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                    <button onClick={createOrder} style={{ flex: 1, fontFamily: disp, fontWeight: 700, fontSize: 13, padding: "11px", background: C.ink, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                      <FilePlus2 size={15} /> СОЗДАТЬ ЗАКАЗ
                    </button>
                    <button onClick={() => setOpenBreak(!openBreak)} style={{ fontFamily: disp, fontWeight: 700, fontSize: 13, padding: "11px 14px", background: "transparent", color: C.ink, border: `1px solid ${C.line}`, borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                      {openBreak ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Расшифровка
                    </button>
                  </div>
                </>
              )}
            </Panel>
          )}

          {openBreak && !r.unmatched && r.totalPieces > 0 && (
            <Panel title="Расшифровка расчёта" icon={<FlaskConical size={16} color={C.accent} />}>
              <Row k={`базовый расход (${fmt(passport[2], 2)} м × Σ коэф×шт)`} v={`${fmt(r.raw_m)} м`} />
              <Row k="перекос размеров" v={`× ${fmt(r.pEff, 3)}`} />
              <Row k={`ширина (≈${r.f.width} см / эталон ${REF_WIDTH})`} v={`× ${fmt(r.wEff, 3)}`} />
              <Row k="потери раскрой+пошив ≈" v={`× ${fmt(1 + DEFAULT_LOSS, 2)}`} />
              <Row k="усадка ≈" v={`× ${fmt(1 + r.f.shrink, 2)}`} />
              <Row k="потребность, м" v={`${fmt(r.net_m)} м`} bold />
              <Row k={`масса пог. метра (${r.f.den} г/м² × ${r.f.width / 100} м)`} v={`${fmt(r.klm, 3)} кг/м`} />
              <Row k="потребность, кг" v={`${fmt(r.net_kg)} кг`} bold />
              <Row k={`+ резерв ${fmt(reservePct * 100, 0)}% и округление до ≈${DEFAULT_ROLL_KG} кг`} v={`${fmt(r.order_kg)} кг`} bold />
              <div style={{ fontFamily: mono, fontSize: 10.5, color: C.muted, borderTop: `1px dashed ${C.line}`, paddingTop: 8, marginTop: 8 }}>
                ≈ — дефолт (нет в базах): ширина по категории, потери 7%, усадка по категории, рулон {DEFAULT_ROLL_KG} кг. Заполни в справочниках — точность вырастет.
              </div>
            </Panel>
          )}

          {orders.length > 0 && (
            <Panel title="Созданные заказы (сессия)" icon={<Package size={16} color={C.accent} />}>
              {orders.map((o) => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: mono, fontSize: 11.5, padding: "6px 0", borderBottom: `1px dashed ${C.line}` }}>
                  <span style={{ background: C.accent, color: "#fff", borderRadius: 3, padding: "1px 6px", fontWeight: 600 }}>#{o.id}</span>
                  <span style={{ fontFamily: sans, fontWeight: 600 }}>{o.sku}</span>
                  <span style={{ color: C.muted }}>{o.pieces} шт · {fmt(o.kg, 0)} кг · {o.sup}</span>
                  <span style={{ marginLeft: "auto", fontWeight: 600 }}>{rub(o.cost)}</span>
                </div>
              ))}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
