const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../src/engine.js"), { solve, defaultModel, POL } = E;
const maxErr = r => Math.max(Math.abs(r.G.errQ), ...POL.map(p => Math.abs(r.G.errL[p])));
const clone = o => JSON.parse(JSON.stringify(o));

test("預設案例：收斂且全廠平衡", () => {
  const r = solve(defaultModel());
  assert.equal(r.conv, true); assert.equal(r.G.status, "BALANCED"); assert.deepEqual(r.warn, []);
  assert.ok(maxErr(r) < 1e-6);
});
test("各單元由實際流股重算的誤差 < 1e-9", () => {
  const r = solve(defaultModel());
  for (const x of Object.values(r.res)) { assert.ok(Math.abs(x.errQ) < 1e-9); POL.forEach(p => assert.ok(Math.abs(x.errL[p]) < 1e-9)); }
});
test("隨機參數（含化學除磷、濾液分配、回流比）200 次皆收斂且守恆", () => {
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let k = 0; k < 200; k++) {
    const m = defaultModel();
    m.units.forEach(u => { if (u.type !== "source") { POL.forEach(p => { u.eta[p] = rnd() * .9; u.cap[p] = rnd(); }); u.filt = rnd(); if (u.ts) u.ts = 1 + rnd() * 20; } });
    m.units[4].chemP = rnd() * .5; m.units[1].qLoss = rnd() * .1;
    m.streams.find(s => s.id === "R-01").pct = rnd() * 150;
    const r = solve(m); assert.ok(r.conv, "k=" + k); assert.ok(maxErr(r) < 1e-6, "k=" + k);
  }
});
test("進流水單元無出流股時產生警示", () => {
  const m = defaultModel(); m.streams = m.streams.filter(s => s.id !== "W-01");
  assert.ok(solve(m).warn.some(w => w.includes("沒有任何出流股")));
});
test("validate：預設模型通過；非法資料被拒絕", () => {
  assert.deepEqual(E.validate(defaultModel()), []);
  let m = defaultModel(); m.units[2].eta.SS = 5; assert.ok(E.validate(m).length);
  m = defaultModel(); m.units[1].id = "bad id!"; assert.ok(E.validate(m).length);
  m = defaultModel(); m.streams[0].to = "NOPE"; assert.ok(E.validate(m).length);
  m = defaultModel(); m.units.push({ ...clone(m.units[0]), id: "T9-9" }); assert.ok(E.validate(m).some(x => x.includes("source")));
  m = defaultModel(); m.streams.push({ id: "X-1", from: "T01-02", to: "T01-02", type: "water", pct: 1 }); assert.ok(E.validate(m).length);
  m = defaultModel(); m.energy.DO = 99; assert.ok(E.validate(m).length);
});
test("Excel 工作表往返：轉換後模型求解結果一致", () => {
  const M = defaultModel(), R = solve(M), sh = E.modelToSheets(M, R);
  const back = clone({ Source: sh.Source, Units: sh.Units, Streams: sh.Streams, Energy: sh.Energy });
  const o = E.sheetsToModel(back); assert.deepEqual(E.validate(o), []);
  const R2 = solve(E.buildModel(o));
  assert.ok(Math.abs(R2.res["T01-09"].Lin.COD - R.res["T01-09"].Lin.COD) < 1e-9);
});
test("Excel 匯出防公式注入；匯入還原", () => {
  const M = defaultModel(), R = solve(M); M.units[2].name = "=cmd|x";
  const sh = E.modelToSheets(M, R); assert.equal(sh.Units[2].name, "'=cmd|x");
  assert.equal(E.sheetsToModel({ Source: sh.Source, Units: sh.Units, Streams: sh.Streams }).units[2].name, "=cmd|x");
});
test("能耗：數值有限、分項加總一致、DO 越高耗電越多、超範圍被拒", () => {
  const M = defaultModel(), R = solve(M), x = E.energy(M, R);
  assert.ok(x.valid && x.total > 0);
  assert.ok(Math.abs(x.items.reduce((a, i) => a + i.kWhd, 0) - x.total) < 1e-9);
  assert.ok(E.energy(M, R, { DO: 3 }).total > E.energy(M, R, { DO: 1 }).total);
  assert.equal(E.energy(M, R, { DO: 8 }).valid, false);
  assert.ok(E.validateEnergy({ ...M.energy, DO: 99 }).length);
});
