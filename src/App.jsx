import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Slider } from "./components/ui/slider";
import { Switch } from "./components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import { Separator } from "./components/ui/separator";
import { Textarea } from "./components/ui/textarea";
import { Badge } from "./components/ui/badge";
import { Checkbox } from "./components/ui/checkbox";
import {
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Calculator,
  Upload,
  Download,
  Info,
  Settings,
  Wand2,
  BarChart3,
  Table2,
  Beaker,
} from "lucide-react";
// ----------------------- Utility helpers -----------------------
const round2 = (x) => Math.round(x * 100) / 100;
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const std = (arr) => {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  const v = mean(arr.map((x) => (x - m) * (x - m)));
  return Math.sqrt(v);
};

function robustZ(values) {
  // fallback to z-score with small epsilon
  const m = mean(values);
  const s = std(values) || 1e-6;
  return values.map((v) => (v - m) / s);
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (s) => {
    const str = String(s ?? "");
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))];
  return lines.join("\n");
}

function parseCSV(text) {
  // minimal CSV parser (no external deps)
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    let row = [];
    let cur = "";
    let inQ = false;
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === '"') {
        if (inQ && line[j + 1] === '"') {
          cur += '"';
          j++;
        } else {
          inQ = !inQ;
        }
      } else if (c === "," && !inQ) {
        row.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
    row.push(cur);
    const obj = {};
    headers.forEach((h, idx) => (obj[h] = row[idx] ?? ""));
    rows.push(obj);
  }
  return rows;
}

// ----------------------- Sample data -----------------------
const SAMPLE_CSV = `name,role,rounds,kills,deaths,assists,total_damage,kast_percent,first_kills,first_deaths,multi2k,multi3k,multi4k,multi5k,clutch_wins,plants,defuses,trade_kills,non_damage_assists
Alpha,Duelist,240,420,350,68,31500,71,64,59,28,10,2,0,6,18,4,52,14
Bravo,Initiator,240,310,300,112,27400,78,28,32,18,6,1,0,5,22,3,67,41
Charlie,Controller,240,260,280,129,24600,80,17,21,12,5,1,0,4,15,11,73,55
Delta,Sentinel,240,230,240,140,22100,83,9,17,8,3,0,0,7,12,18,81,62
Echo,Duelist,240,395,360,74,30800,69,58,66,26,8,3,1,3,14,3,48,11
Foxtrot,Initiator,240,300,290,120,26800,77,24,28,16,6,1,0,6,20,5,70,38
Golf,Controller,240,275,265,118,25500,79,19,20,13,4,1,0,5,13,16,69,47
Hotel,Sentinel,240,240,235,146,22800,84,8,15,7,2,0,0,8,10,20,85,64`;

function csvToObjects(csv) {
  const rows = parseCSV(csv);
  // coerce types
  return rows.map((r) => {
    const num = (k, d = 0) => (r[k] === undefined || r[k] === "" ? d : Number(r[k]));
    return {
      name: r.name,
      role: r.role,
      rounds: num("rounds"),
      kills: num("kills"),
      deaths: num("deaths"),
      assists: num("assists"),
      total_damage: num("total_damage"),
      kast_percent: num("kast_percent"),
      first_kills: num("first_kills"),
      first_deaths: num("first_deaths"),
      multi2k: num("multi2k"),
      multi3k: num("multi3k"),
      multi4k: num("multi4k"),
      multi5k: num("multi5k"),
      clutch_wins: num("clutch_wins"),
      plants: num("plants"),
      defuses: num("defuses"),
      trade_kills: num("trade_kills"),
      non_damage_assists: num("non_damage_assists"),
    };
  });
}

// ----------------------- Core rating logic -----------------------
const DEFAULT_WEIGHTS = {
  kpr: 0.35,
  dpr: 0.45, // negative sign applied later
  adr: 0.15,
  kast: 0.1,
  entry: 0.2,
  clutch: 0.1,
  support: 0.1,
  objective: 0.05,
  multikill: 0.1,
};

const PRESETS = {
  "スカウト（バランス）": {
    ...DEFAULT_WEIGHTS,
  },
  "HLTV風（線形）": {
    kpr: 0.36,
    dpr: 0.53,
    adr: 0.25,
    kast: 0.1,
    entry: 0.15,
    clutch: 0.12,
    support: 0.06,
    objective: 0.04,
    multikill: 0.1,
  },
  "RIB風（エントリー重視）": {
    kpr: 0.28,
    dpr: 0.55,
    adr: 0.18,
    kast: 0.08,
    entry: 0.35, // 先陣死に厳しめ
    clutch: 0.12,
    support: 0.05,
    objective: 0.02,
    multikill: 0.08,
  },
  "サポート可視化": {
    kpr: 0.25,
    dpr: 0.45,
    adr: 0.12,
    kast: 0.18,
    entry: 0.08,
    clutch: 0.08,
    support: 0.25, // アシスト/トレードを厚め
    objective: 0.12,
    multikill: 0.05,
  },
};

function computeDerived(row) {
  const R = Math.max(1, row.rounds || 0);
  const kpr = row.kills / R;
  const dpr = row.deaths / R;
  const adr = row.total_damage / R; // VALOはスケールが高め
  const kast = (row.kast_percent || 0) / 100; // 0-1に
  const entryDelta = (row.first_kills - row.first_deaths) / R;
  const clutchRate = (row.clutch_wins || 0) / R;
  const multikillWeighted =
    (row.multi2k * 0.5 + row.multi3k * 1 + row.multi4k * 1.5 + row.multi5k * 2) / R;
  const supportRate =
    (row.assists + row.trade_kills + (row.non_damage_assists || 0) * 0.5) / R;
  const objectiveRate = (row.plants + row.defuses) / R;
  return {
    ...row,
    kpr,
    dpr,
    adr,
    kast,
    entry: entryDelta,
    clutch: clutchRate,
    multikill: multikillWeighted,
    support: supportRate,
    objective: objectiveRate,
  };
}

function standardizeRows(rows, byRole) {
  const derived = rows.map(computeDerived);
  const groups = byRole
    ? Object.values(
        derived.reduce((acc, r) => {
          acc[r.role] = acc[r.role] || [];
          acc[r.role].push(r);
          return acc;
        }, {})
      )
    : [derived];

  const metrics = [
    "kpr",
    "dpr",
    "adr",
    "kast",
    "entry",
    "clutch",
    "multikill",
    "support",
    "objective",
  ];

  const zMap = new Map();
  groups.forEach((group) => {
    const keys = group.map((g) => g.name);
    const zed = {};
    metrics.forEach((m) => {
      const vals = group.map((g) => g[m]);
      const z = robustZ(vals);
      z.forEach((v, i) => {
        const id = keys[i];
        zed[id] = zed[id] || {};
        zed[id][m] = v;
      });
    });
    // attach
    group.forEach((g) => zMap.set(g.name, { raw: g, z: zed[g.name] }));
  });

  return rows.map((r) => ({ raw: computeDerived(r), z: zMap.get(r.name)?.z || {} }));
}

function computeRatings(rows, weights, opts = { byRole: false, targetStd: 0.15 }) {
  const stdRows = standardizeRows(rows, opts.byRole);
  // signed contributions (DPR negative)
  const contributions = stdRows.map(({ raw, z }) => {
    const contrib = {
      kpr: (weights.kpr || 0) * (z.kpr ?? 0),
      dpr: -(weights.dpr || 0) * (z.dpr ?? 0),
      adr: (weights.adr || 0) * (z.adr ?? 0),
      kast: (weights.kast || 0) * (z.kast ?? 0),
      entry: (weights.entry || 0) * (z.entry ?? 0),
      clutch: (weights.clutch || 0) * (z.clutch ?? 0),
      multikill: (weights.multikill || 0) * (z.multikill ?? 0),
      support: (weights.support || 0) * (z.support ?? 0),
      objective: (weights.objective || 0) * (z.objective ?? 0),
    };
    const rawSum = Object.values(contrib).reduce((a, b) => a + b, 0);
    return { name: raw.name, role: raw.role, contrib, raw, z, rawSum };
  });

  const rawSums = contributions.map((c) => c.rawSum);
  const mu = mean(rawSums);
  const sg = std(rawSums) || 1e-6;
  const scale = (opts.targetStd || 0.15) / sg; // map std to target
  const rated = contributions.map((c) => ({
    ...c,
    rating: 1 + (c.rawSum - mu) * scale,
  }));

  // also prepare stacked chart data per player
  const chartData = rated.map((r) => ({
    name: r.name,
    ...r.contrib,
  }));

  return { rated, chartData };
}

// ----------------------- UI Components -----------------------
function WeightSlider({ label, value, onChange, step = 0.01, min = 0, max = 0.7, hint }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {hint && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-4 h-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-[260px] text-xs leading-relaxed">{hint}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <Badge variant="secondary">{value.toFixed(2)}</Badge>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}

function PresetButtons({ onPick }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.keys(PRESETS).map((k) => (
        <Button key={k} variant="secondary" size="sm" onClick={() => onPick(PRESETS[k])}>
          <Wand2 className="w-4 h-4 mr-1" /> {k}
        </Button>
      ))}
    </div>
  );
}

function MethodBadge({ children }) {
  return (
    <Badge className="rounded-2xl px-3 py-1 text-xs" variant="outline">
      {children}
    </Badge>
  );
}

// ----------------------- Test Helpers -----------------------
function approx(a, b, eps = 0.015) {
  return Math.abs(a - b) <= eps;
}

function runSelfTests() {
  const rows = csvToObjects(SAMPLE_CSV);
  const base = computeRatings(rows, PRESETS["スカウト（バランス）"], { byRole: true, targetStd: 0.15 });
  const mu = mean(base.rated.map((r) => r.rating));
  const sd = std(base.rated.map((r) => r.rating));
  const t1 = approx(mu, 1.0, 1e-9);
  const t2 = approx(sd, 0.15, 0.02);

  // monotonic sort check
  const sorted = [...base.rated].sort((a, b) => b.rating - a.rating);
  const t3 = base.rated.every((_, i, arr) => !arr[i + 1] || sorted[i].name === arr[i].name);

  // additional: DPR が増えると評価が下がる（他条件同一時）
  const synth = [
    { name: "P", role: "Duelist", rounds: 100, kills: 100, deaths: 100, assists: 0, total_damage: 10000, kast_percent: 70, first_kills: 10, first_deaths: 10, multi2k: 5, multi3k: 0, multi4k: 0, multi5k: 0, clutch_wins: 1, plants: 0, defuses: 0, trade_kills: 0, non_damage_assists: 0 },
    { name: "Q", role: "Duelist", rounds: 100, kills: 100, deaths: 120, assists: 0, total_damage: 10000, kast_percent: 70, first_kills: 10, first_deaths: 10, multi2k: 5, multi3k: 0, multi4k: 0, multi5k: 0, clutch_wins: 1, plants: 0, defuses: 0, trade_kills: 0, non_damage_assists: 0 },
  ];
  const synthRated = computeRatings(synth, PRESETS["スカウト（バランス）"], { byRole: true, targetStd: 0.15 }).rated;
  const better = synthRated.find((x) => x.name === "P").rating > synthRated.find((x) => x.name === "Q").rating;
  const t4 = better;

  return [
    { id: "平均=1.00", pass: t1, got: mu.toFixed(6) },
    { id: "標準偏差≈0.15", pass: t2, got: sd.toFixed(3) },
    { id: "ソート一貫性", pass: t3, got: t3 ? "OK" : "NG" },
    { id: "DPR増→評価低下", pass: t4, got: better ? "P>Q" : "P≤Q" },
  ];
}

// ----------------------- Main App -----------------------
export default function App() {
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [rows, setRows] = useState(csvToObjects(SAMPLE_CSV));
  const [weights, setWeights] = useState({ ...PRESETS["スカウト（バランス）"] });
  const [byRole, setByRole] = useState(true);
  const [targetStd, setTargetStd] = useState(0.15);
  const [topN, setTopN] = useState(8);

  const { rated, chartData } = useMemo(
    () => computeRatings(rows, weights, { byRole, targetStd }),
    [rows, weights, byRole, targetStd]
  );

  const sorted = useMemo(
    () => [...rated].sort((a, b) => b.rating - a.rating),
    [rated]
  );

  const metricHints = {
    kpr: "1ラウンドあたりのキル数。火力の中心的指標。",
    dpr: "1ラウンドあたりのデス数。評価では負の寄与として扱います。",
    adr: "1ラウンドあたりの与ダメージ。継続的な圧力の代理指標。",
    kast: "KAST（Kill/Assist/Survive/Traded）率。安定貢献。",
    entry: "先陣キルと先陣死の差分（/R）。人数有利・不利を作る力。",
    clutch: "クラッチ勝利率（/R）。高インパクトの緊急対応力。",
    multikill: "2K,3K,4K,5Kの重み付き（/R）。ラウンド決定力。",
    support: "アシスト＋トレード＋非ダメアシスト（/R）。支援貢献。",
    objective: "設置・解除（/R）。オブジェクト関与の可視化。",
  };

  const metricOrder = [
    "kpr",
    "dpr",
    "adr",
    "kast",
    "entry",
    "clutch",
    "multikill",
    "support",
    "objective",
  ];

  const stackedColors = {
    kpr: "#3b82f6",
    dpr: "#ef4444",
    adr: "#22c55e",
    kast: "#a855f7",
    entry: "#f59e0b",
    clutch: "#06b6d4",
    multikill: "#e879f9",
    support: "#8b5cf6",
    objective: "#10b981",
  };

  const headers = [
    "name",
    "role",
    "rounds",
    "kills",
    "deaths",
    "assists",
    "total_damage",
    "kast_percent",
    "first_kills",
    "first_deaths",
    "multi2k",
    "multi3k",
    "multi4k",
    "multi5k",
    "clutch_wins",
    "plants",
    "defuses",
    "trade_kills",
    "non_damage_assists",
  ];

  const handleCSVLoad = () => {
    try {
      const objs = csvToObjects(csv);
      if (!objs.length) return;
      setRows(objs);
      setTopN(Math.min(10, objs.length));
    } catch (e) {
      alert("CSVの読み込みに失敗しました。フォーマットをご確認ください。");
    }
  };

  const exportResults = () => {
    const out = sorted.map((r) => ({
      name: r.name,
      role: r.role,
      rating: round2(r.rating),
      ...r.raw,
    }));
    downloadText("val-war_results.csv", toCSV(out));
  };

  const tests = useMemo(() => runSelfTests(), []);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">VALORANT 選手評価ラボ <span className="text-slate-500">（VAL-WAR Draft）</span></h1>
            <p className="text-slate-600 mt-1">全ロール横断で「勝利貢献度」を数値化し、スカウトに使える総合指標を試作します。</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <MethodBadge>線形モデル</MethodBadge>
              <MethodBadge>zスコア正規化</MethodBadge>
              <MethodBadge>ロール内正規化オプション</MethodBadge>
              <MethodBadge>スタック貢献可視化</MethodBadge>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => downloadText("sample_valorant.csv", SAMPLE_CSV)}>
              <Download className="w-4 h-4 mr-1" /> サンプルCSV
            </Button>
            <Button onClick={exportResults}>
              <Download className="w-4 h-4 mr-1" /> 結果をCSV出力
            </Button>
          </div>
        </div>

        <Tabs defaultValue="app" className="mt-6">
          <TabsList className="grid grid-cols-5 md:grid-cols-7 gap-2">
            <TabsTrigger value="app"><Calculator className="w-4 h-4 mr-1" /> アプリ</TabsTrigger>
            <TabsTrigger value="method"><Info className="w-4 h-4 mr-1" /> 方式</TabsTrigger>
            <TabsTrigger value="data"><Table2 className="w-4 h-4 mr-1" /> データ</TabsTrigger>
            <TabsTrigger value="insight"><BarChart3 className="w-4 h-4 mr-1" /> インサイト</TabsTrigger>
            <TabsTrigger value="howto"><Settings className="w-4 h-4 mr-1" /> 使い方</TabsTrigger>
            <TabsTrigger value="refs"><Info className="w-4 h-4 mr-1" /> 参考</TabsTrigger>
            <TabsTrigger value="tests"><Beaker className="w-4 h-4 mr-1" /> テスト</TabsTrigger>
          </TabsList>

          {/* -------------------- APP TAB -------------------- */}
          <TabsContent value="app" className="mt-4">
            <div className="grid md:grid-cols-3 gap-4 md:gap-6">
              <Card className="md:col-span-1 rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle>重み設定</CardTitle>
                  <CardDescription>プリセットから選ぶか、各指標の重みを調整</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <PresetButtons onPick={(preset) => setWeights({ ...preset })} />
                  <Separator />
                  <div className="space-y-4">
                    {metricOrder.map((m) => (
                      <WeightSlider
                        key={m}
                        label={m.toUpperCase()}
                        value={weights[m] || 0}
                        onChange={(v) => setWeights((w) => ({ ...w, [m]: v }))}
                        hint={metricHints[m]}
                      />
                    ))}
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch checked={byRole} onCheckedChange={setByRole} id="role-norm" />
                      <Label htmlFor="role-norm">ロール内で正規化（公平比較）</Label>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Label className="text-sm">レーティング分散（標準偏差）</Label>
                    <div className="flex items-center gap-3">
                      <Slider value={[targetStd]} min={0.08} max={0.30} step={0.01} onValueChange={(v) => setTargetStd(v[0])} />
                      <Badge variant="secondary">{targetStd.toFixed(2)}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">平均1.00・標準偏差{targetStd.toFixed(2)}になるよう全体をスケーリングします。</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="md:col-span-2 rounded-2xl shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>ランキング</CardTitle>
                      <CardDescription>重みに基づいて算出された総合レーティング（VAL-WAR Draft）</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm">Top</Label>
                      <Input type="number" min={1} max={sorted.length} value={topN} onChange={(e) => setTopN(Math.max(1, Math.min(sorted.length, Number(e.target.value) || 1)))} className="w-20" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-600">
                          <th className="py-2 pr-4">#</th>
                          <th className="py-2 pr-4">選手</th>
                          <th className="py-2 pr-4">ロール</th>
                          <th className="py-2 pr-4">VAL-WAR</th>
                          <th className="py-2 pr-4">KPR</th>
                          <th className="py-2 pr-4">DPR</th>
                          <th className="py-2 pr-4">ADR</th>
                          <th className="py-2 pr-4">KAST%</th>
                          <th className="py-2 pr-4">EntryΔ/R</th>
                          <th className="py-2 pr-4">Clutch/R</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.slice(0, topN).map((p, idx) => (
                          <tr key={p.name} className="border-t">
                            <td className="py-2 pr-4">{idx + 1}</td>
                            <td className="py-2 pr-4 font-medium">{p.name}</td>
                            <td className="py-2 pr-4 text-slate-600">{p.role}</td>
                            <td className="py-2 pr-4 font-semibold">{round2(p.rating)}</td>
                            <td className="py-2 pr-4">{round2(p.raw.kpr)}</td>
                            <td className="py-2 pr-4">{round2(p.raw.dpr)}</td>
                            <td className="py-2 pr-4">{round2(p.raw.adr)}</td>
                            <td className="py-2 pr-4">{Math.round(p.raw.kast * 100)}</td>
                            <td className="py-2 pr-4">{round2(p.raw.entry)}</td>
                            <td className="py-2 pr-4">{round2(p.raw.clutch)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <Separator className="my-4" />
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <RBarChart data={chartData.slice(0, topN)} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                        <XAxis dataKey="name" />
                        <YAxis tickFormatter={(v) => v.toFixed(2)} />
                        <ChartTooltip formatter={(value, name) => [value.toFixed(2), name.toUpperCase()]} />
                        <Legend />
                        {metricOrder.map((m) => (
                          <Bar key={m} dataKey={m} stackId="a" fill={stackedColors[m]} />
                        ))}
                      </RBarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">バーは各指標のzスコア×重みの寄与（DPRは負号）をスタック表示。合計がレーティング偏差の元になります。</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* -------------------- METHOD TAB -------------------- */}
          <TabsContent value="method" className="mt-4">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle>設計方針（要約）</CardTitle>
                  <CardDescription>HLTV的な線形モデル＋VALORANT特有の要素を追加</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-700">
                  <ul className="list-disc pl-5 space-y-2">
                    <li>多指標（KPR/DPR/ADR/KAST/Entry/Clutch/Support/Objective/Multi）を<strong>zスコア正規化</strong>し、<strong>重み付き加算</strong>。</li>
                    <li>比較の公平性のため、<strong>ロール内での正規化</strong>をオプション化（デフォルトON）。</li>
                    <li>総合スコアは平均1.00・標準偏差α（可変、既定0.15）になるよう線形変換。</li>
                    <li>“WAR的”解釈：<em>平均的な控え</em>に対する相対優位（&gt; 1.00）を示す一元指標。</li>
                  </ul>
                  <Separator />
                  <p>数式スケッチ：</p>
                  <pre className="bg-slate-50 p-3 rounded-xl overflow-auto text-xs">
{`各プレイヤーiの指標 m ∈ {kpr,dpr,adr,kast,entry,clutch,multikill,support,objective}
z_{i,m} = (x_{i,m} - 平均_m) / 標準偏差_m  （ロール内選択時はロール別平均/分散）
raw_i = Σ_m w_m * s_m * z_{i,m}    （s_mは符号、DPRのみ s_m = -1, 他は+1）
VAL\\-WAR_i = 1 + (raw_i - 平均_raw) * (α / 標準偏差_raw)
`}
                  </pre>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle>指標の意味（抜粋）</CardTitle>
                  <CardDescription>勝率に効く要素を広くカバー</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-slate-700 leading-6">
                  <ul className="list-disc pl-5 space-y-2">
                    <li><strong>KPR / DPR / ADR</strong>：基本火力。DPRはマイナス寄与。</li>
                    <li><strong>KAST</strong>：キル/アシスト/生存/トレードのいずれかで貢献。</li>
                    <li><strong>EntryΔ</strong>：先陣キル−先陣死（/R）。人数有利の創出。</li>
                    <li><strong>Clutch</strong>：1vX勝利率。ハイレバレッジ局面の価値。</li>
                    <li><strong>Support</strong>：アシスト＋トレード＋非ダメアシスト。</li>
                    <li><strong>Objective</strong>：設置/解除の関与。</li>
                    <li><strong>MultiKill</strong>：2K以上の重み付き回数。</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* -------------------- DATA TAB -------------------- */}
          <TabsContent value="data" className="mt-4">
            <div className="grid md:grid-cols-2 gap-6 items-start">
              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle>CSVインポート</CardTitle>
                  <CardDescription>vrl / RIB から輸出した値をヘッダに合わせて貼り付け</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm">CSV（ヘッダ必須）</Label>
                    <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} className="min-h-[180px] font-mono text-xs" />
                    <div className="mt-2 flex gap-2">
                      <Button onClick={handleCSVLoad}><Upload className="w-4 h-4 mr-1" /> ロード</Button>
                      <Button variant="secondary" onClick={() => setCsv(SAMPLE_CSV)}>サンプルを読み込む</Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm">必須ヘッダ</Label>
                    <div className="mt-1 p-3 bg-slate-50 rounded-xl font-mono text-xs overflow-auto">
                      {headers.join(", ")}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle>プレビュー</CardTitle>
                  <CardDescription>{rows.length} 件の選手データ</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="text-left text-slate-600">
                          {headers.map((h) => (
                            <th key={h} className="py-2 pr-4 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 12).map((r, idx) => (
                          <tr key={idx} className="border-t">
                            {headers.map((h) => (
                              <td key={h} className="py-1.5 pr-4 whitespace-nowrap">{String(r[h])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {rows.length > 12 && (
                    <p className="text-xs text-slate-500 mt-2">※ 表示は先頭12件まで。計算は全件に対して行われます。</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* -------------------- INSIGHT TAB -------------------- */}
          <TabsContent value="insight" className="mt-4">
            <div className="grid gap-6">
              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle>読み取りの指針</CardTitle>
                  <CardDescription>スカウト利用における注意点</CardDescription>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-slate-700 space-y-3">
                  <ul className="list-disc pl-5 space-y-2">
                    <li>レーティングは<strong>相対値</strong>（平均=1.00）。リーグや期間が変われば再計算が必要です。</li>
                    <li>小規模サンプルではzスコアが不安定になりやすい。<strong>最低200ラウンド</strong>程度を推奨。</li>
                    <li>スクラムと大会でメタが異なる場合、<strong>データを分けて評価</strong>し、双方の傾向を見る。</li>
                    <li>VAL-WARが高い=即採用ではない。<strong>役割適合・コミュニケーション</strong>等の定性的評価と併用。</li>
                    <li>重みはチーム哲学を反映可能。例：<em>人数有利重視</em>ならEntryを上げ、<em>安定性重視</em>ならKASTとDPRの比重を上げる。</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* -------------------- HOW TO TAB -------------------- */}
          <TabsContent value="howto" className="mt-4">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle>使い方（クイック手順）</CardTitle>
                <CardDescription>vrl / RIBのエクスポートを貼り付けて評価</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-slate-700 leading-6">
                <ol className="list-decimal pl-5 space-y-2">
                  <li><strong>データ</strong>タブでCSVを貼り付け、「ロード」を押す。</li>
                  <li><strong>アプリ</strong>タブでプリセットを選択。必要なら各<strong>重み</strong>を調整。</li>
                  <li>ロールによる偏りを抑えたい場合は「<strong>ロール内で正規化</strong>」をONのままに。</li>
                  <li>ランキングと<strong>スタック寄与グラフ</strong>で、誰がどの要素で優位かを確認する。</li>
                  <li>結果を<strong>CSV出力</strong>し、スカウトレポートやダッシュボードに連携。</li>
                </ol>
                <Separator className="my-3" />
                <p className="text-xs text-slate-500">※ 列名が異なる場合はヘッダを合わせてください。追加列があっても無視されます。</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* -------------------- REFS TAB -------------------- */}
          <TabsContent value="refs" className="mt-4">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle>参考（要点）</CardTitle>
                <CardDescription>既存指標の長所と限界を踏まえた設計</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-slate-700 leading-6 space-y-2">
                <ul className="list-disc pl-5 space-y-2">
                  <li>HLTV Rating は KPR/DPR/ADR/KAST/Impact を線形結合し、平均1.0に正規化する設計。</li>
                  <li>VALORANT の ACS は攻撃的プレイを優遇し、デスを評価に含めない点が課題。</li>
                  <li>コミュニティ指標（VLR/THESPIKE/RIB）は文脈（人数差・エコ状態等）を加味。特に RIB はエントリーを重視。</li>
                  <li>“WAR 的”発想：ラウンド勝率に結びつく要素（先陣キル、クラッチ、トレード等）の寄与を重みに反映。</li>
                  <li>解釈可能性（Explainability）重視のため、シンプルな線形モデル＋可視化で採用判断を支援。</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* -------------------- TESTS TAB -------------------- */}
          <TabsContent value="tests" className="mt-4">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle>セルフテスト</CardTitle>
                <CardDescription>内部整合性チェック（変更しても壊れていないかを簡易確認）</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-600">
                        <th className="py-2 pr-4">テスト</th>
                        <th className="py-2 pr-4">結果</th>
                        <th className="py-2 pr-4">詳細</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tests.map((t) => (
                        <tr key={t.id} className="border-t">
                          <td className="py-2 pr-4">{t.id}</td>
                          <td className="py-2 pr-4">{t.pass ? "✅ PASS" : "❌ FAIL"}</td>
                          <td className="py-2 pr-4">{t.got}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-500 mt-3">※ 期待挙動：平均が1.00付近、標準偏差がターゲットに近い値（0.15）。</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
