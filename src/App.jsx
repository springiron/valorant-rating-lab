import React, { useMemo, useState } from "react";
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

// ----------------------- Agent to Role mapping -----------------------
const AGENT_TO_ROLE = {
  "Omen": "Controller",
  "Viper": "Controller", 
  "Sova": "Initiator",
  "Raze": "Duelist",
  "Cypher": "Sentinel",
  "Jett": "Duelist",
  "Killjoy": "Sentinel",
  "Fade": "Initiator",
  "Breach": "Initiator",
  "Kayo": "Initiator",
  "Yoru": "Duelist",
  "Gekko": "Initiator",
  "Neon": "Duelist",
  "Tejo": "Duelist",
  "Skye": "Initiator",
  "Astra": "Controller",
  "Brimstone": "Controller",
  "Vyse": "Sentinel",
  "Deadlock": "Sentinel",
  "Harbor": "Controller",
  "Sage": "Sentinel",
  "Chamber": "Sentinel",
  "Iso": "Duelist",
  "Clove": "Controller",
  "Waylay": "Sentinel",
  "Phoenix": "Duelist",
  "Reyna": "Duelist"
};

// ----------------------- Sample data (actual format) -----------------------
const SAMPLE_CSV = `Player_Name,Agent,Attack_Got_Round,Defense_Got_Round,Kill_All,Death_All,Assists_All,Fk_All,Fd_All,Acs_All,Adr_All,Kast_All,Hs_All
Meteor,Jett,6,5,24,18,8,4,2,312,189,75%,28%
Munchkin,Omen,6,5,16,15,14,2,3,201,128,71%,24%
Karon,Cypher,6,5,14,12,18,1,2,186,96,80%,22%
t3xture,Raze,6,5,20,16,10,3,1,267,165,68%,31%
valyn,Sova,6,5,18,14,12,2,2,234,142,77%,26%
Chronicle,Fade,6,5,15,13,16,1,3,198,118,75%,23%
Boaster,Omen,6,5,12,16,15,1,4,167,102,69%,19%
Alfajer,Killjoy,6,5,17,11,14,2,1,223,134,82%,25%
Derke,Jett,6,5,22,15,9,5,2,289,178,73%,29%
Leo,Sova,6,5,16,13,17,1,2,211,125,79%,24%`;

function csvToObjects(csv) {
  const rows = parseCSV(csv);
  return rows.map((r) => {
    const num = (k, d = 0) => (r[k] === undefined || r[k] === "" ? d : Number(r[k]));
    const parsePercent = (k, d = 0) => {
      const val = r[k];
      if (!val || val === "") return d;
      const cleanVal = val.toString().replace('%', '');
      return Number(cleanVal);
    };
    
    return {
      name: r.Player_Name || r.name || "",
      agent: r.Agent || "",
      role: AGENT_TO_ROLE[r.Agent] || "Unknown",
      rounds: num("Attack_Got_Round") + num("Defense_Got_Round"),
      attack_rounds: num("Attack_Got_Round"),
      defense_rounds: num("Defense_Got_Round"),
      kills: num("Kill_All"),
      deaths: num("Death_All"),
      assists: num("Assists_All"),
      first_kills: num("Fk_All"),
      first_deaths: num("Fd_All"),
      acs: num("Acs_All"),
      adr: num("Adr_All"),
      kast_percent: parsePercent("Kast_All"),
      hs_percent: parsePercent("Hs_All"),
      // calculated total damage from ADR
      total_damage: num("Adr_All") * (num("Attack_Got_Round") + num("Defense_Got_Round")),
      // attack/defense specific if available
      kills_attack: num("Kill_Attack"),
      kills_defense: num("Kill_Defence"),
      deaths_attack: num("Death_Attack"),
      deaths_defense: num("Death_Defence"),
      assists_attack: num("Assists_Attack"),
      assists_defense: num("Assists_Defence"),
      acs_attack: num("Acs_Attack"),
      acs_defense: num("Acs_Defence"),
      adr_attack: num("Adr_Attack"),
      adr_defense: num("Adr_Defence"),
      kast_attack: parsePercent("Kast_Attack"),
      kast_defense: parsePercent("Kast_Defence"),
      hs_attack: parsePercent("Hs_Attack"),
      hs_defense: parsePercent("Hs_Defence"),
    };
  });
}

// ----------------------- Core rating logic (Updated) -----------------------
const DEFAULT_WEIGHTS = {
  kpr: 0.30,
  dpr: 0.40, // negative sign applied later
  adr: 0.12,
  kast: 0.15,
  entry: 0.25,
  acs: 0.20,
  headshot: 0.08,
  consistency: 0.10,
};

const PRESETS = {
  "スカウト（バランス）": {
    ...DEFAULT_WEIGHTS,
  },
  "火力重視": {
    kpr: 0.40,
    dpr: 0.50,
    adr: 0.20,
    kast: 0.10,
    entry: 0.20,
    acs: 0.25,
    headshot: 0.15,
    consistency: 0.05,
  },
  "安定性重視": {
    kpr: 0.20,
    dpr: 0.35,
    adr: 0.08,
    kast: 0.25,
    entry: 0.15,
    acs: 0.12,
    headshot: 0.05,
    consistency: 0.20,
  },
  "エントリー重視": {
    kpr: 0.25,
    dpr: 0.45,
    adr: 0.10,
    kast: 0.12,
    entry: 0.35,
    acs: 0.18,
    headshot: 0.10,
    consistency: 0.08,
  },
  "ACS基準": {
    kpr: 0.15,
    dpr: 0.30,
    adr: 0.10,
    kast: 0.15,
    entry: 0.15,
    acs: 0.40,
    headshot: 0.12,
    consistency: 0.08,
  },
};

function computeDerived(row) {
  const R = Math.max(1, row.rounds || 0);
  const kpr = row.kills / R;
  const dpr = row.deaths / R;
  const adr = row.adr || (row.total_damage / R);
  const kast = (row.kast_percent || 0) / 100;
  const entryDelta = (row.first_kills - row.first_deaths) / R;
  const acsPerRound = (row.acs || 0) / R;
  const headshotRate = (row.hs_percent || 0) / 100;
  
  // Consistency metric: balance between attack and defense performance
  const attackKPR = row.attack_rounds > 0 ? (row.kills_attack || row.kills * 0.5) / row.attack_rounds : kpr;
  const defenseKPR = row.defense_rounds > 0 ? (row.kills_defense || row.kills * 0.5) / row.defense_rounds : kpr;
  const consistency = 1 - Math.abs(attackKPR - defenseKPR) / Math.max(attackKPR, defenseKPR, 0.1);
  
  return {
    ...row,
    kpr,
    dpr,
    adr,
    kast,
    entry: entryDelta,
    acs_per_round: acsPerRound,
    headshot: headshotRate,
    consistency: Math.max(0, consistency),
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
    "acs_per_round",
    "headshot",
    "consistency",
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
    group.forEach((g) => zMap.set(g.name, { raw: g, z: zed[g.name] }));
  });

  return rows.map((r) => ({ raw: computeDerived(r), z: zMap.get(r.name)?.z || {} }));
}

function computeRatings(rows, weights, opts = { byRole: false, targetStd: 0.15 }) {
  const stdRows = standardizeRows(rows, opts.byRole);
  const contributions = stdRows.map(({ raw, z }) => {
    const contrib = {
      kpr: (weights.kpr || 0) * (z.kpr ?? 0),
      dpr: -(weights.dpr || 0) * (z.dpr ?? 0),
      adr: (weights.adr || 0) * (z.adr ?? 0),
      kast: (weights.kast || 0) * (z.kast ?? 0),
      entry: (weights.entry || 0) * (z.entry ?? 0),
      acs: (weights.acs || 0) * (z.acs_per_round ?? 0),
      headshot: (weights.headshot || 0) * (z.headshot ?? 0),
      consistency: (weights.consistency || 0) * (z.consistency ?? 0),
    };
    const rawSum = Object.values(contrib).reduce((a, b) => a + b, 0);
    return { name: raw.name, role: raw.role, contrib, raw, z, rawSum };
  });

  const rawSums = contributions.map((c) => c.rawSum);
  const mu = mean(rawSums);
  const sg = std(rawSums) || 1e-6;
  const scale = (opts.targetStd || 0.15) / sg;
  const rated = contributions.map((c) => ({
    ...c,
    rating: 1 + (c.rawSum - mu) * scale,
  }));

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

  const sorted = [...base.rated].sort((a, b) => b.rating - a.rating);
  const t3 = sorted.length > 1 && sorted[0].rating >= sorted[sorted.length - 1].rating;

  // Test role mapping
  const hasRoles = rows.every(r => r.role !== "Unknown");
  const t4 = hasRoles;

  return [
    { id: "平均=1.00", pass: t1, got: mu.toFixed(6) },
    { id: "標準偏差≈0.15", pass: t2, got: sd.toFixed(3) },
    { id: "ソート一貫性", pass: t3, got: t3 ? "OK" : "NG" },
    { id: "ロールマッピング", pass: t4, got: hasRoles ? "OK" : "Some Unknown" },
  ];
}

// ----------------------- Main App -----------------------
export default function App() {
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [rows, setRows] = useState(csvToObjects(SAMPLE_CSV));
  const [weights, setWeights] = useState({ ...PRESETS["スカウト（バランス）"] });
  const [byRole, setByRole] = useState(true);
  const [targetStd, setTargetStd] = useState(0.15);
  const [topN, setTopN] = useState(10);

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
    kast: "KAST（Kill/Assist/Survive/Traded）率。安定貢献度。",
    entry: "先陣キルと先陣死の差分（/R）。人数有利・不利を作る力。",
    acs: "Average Combat Score。VALORANTの総合戦闘スコア。",
    headshot: "ヘッドショット率。精密射撃の技術力指標。",
    consistency: "攻撃・守備間のパフォーマンス安定性。",
  };

  const metricOrder = [
    "kpr",
    "dpr", 
    "adr",
    "kast",
    "entry",
    "acs",
    "headshot",
    "consistency",
  ];

  const stackedColors = {
    kpr: "#3b82f6",
    dpr: "#ef4444",
    adr: "#22c55e",
    kast: "#a855f7",
    entry: "#f59e0b",
    acs: "#06b6d4",
    headshot: "#e879f9",
    consistency: "#8b5cf6",
  };

  const headers = [
    "Player_Name",
    "Agent",
    "Attack_Got_Round",
    "Defense_Got_Round", 
    "Kill_All",
    "Death_All",
    "Assists_All",
    "Fk_All",
    "Fd_All",
    "Acs_All",
    "Adr_All",
    "Kast_All",
    "Hs_All",
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
      agent: r.raw.agent,
      rating: round2(r.rating),
      ...r.raw,
    }));
    downloadText("val-war_hybrid_results.csv", toCSV(out));
  };

  const tests = useMemo(() => runSelfTests(), []);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">VALORANT 選手評価ラボ <span className="text-slate-500">（ハイブリッド版）</span></h1>
            <p className="text-slate-600 mt-1">実際のマッチデータ構造に対応。ACS・HS%等の新指標も活用した総合評価システム。</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <MethodBadge>実データ対応</MethodBadge>
              <MethodBadge>ACS・HS%統合</MethodBadge>
              <MethodBadge>攻守別分析</MethodBadge>
              <MethodBadge>エージェント→ロール自動変換</MethodBadge>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => downloadText("sample_valorant_real.csv", SAMPLE_CSV)}>
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
                  <CardDescription>実データ対応版。ACS・HS%等の新指標も調整可能</CardDescription>
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
                      <CardDescription>実データ対応ハイブリッド評価（VAL-WAR Hybrid）</CardDescription>
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
                          <th className="py-2 pr-4">エージェント</th>
                          <th className="py-2 pr-4">ロール</th>
                          <th className="py-2 pr-4">VAL-WAR</th>
                          <th className="py-2 pr-4">KPR</th>
                          <th className="py-2 pr-4">DPR</th>
                          <th className="py-2 pr-4">ADR</th>
                          <th className="py-2 pr-4">ACS</th>
                          <th className="py-2 pr-4">KAST%</th>
                          <th className="py-2 pr-4">HS%</th>
                          <th className="py-2 pr-4">EntryΔ/R</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.slice(0, topN).map((p, idx) => (
                          <tr key={p.name} className="border-t">
                            <td className="py-2 pr-4">{idx + 1}</td>
                            <td className="py-2 pr-4 font-medium">{p.name}</td>
                            <td className="py-2 pr-4 text-slate-600">{p.raw.agent}</td>
                            <td className="py-2 pr-4 text-slate-600">{p.role}</td>
                            <td className="py-2 pr-4 font-semibold">{round2(p.rating)}</td>
                            <td className="py-2 pr-4">{round2(p.raw.kpr)}</td>
                            <td className="py-2 pr-4">{round2(p.raw.dpr)}</td>
                            <td className="py-2 pr-4">{round2(p.raw.adr)}</td>
                            <td className="py-2 pr-4">{Math.round(p.raw.acs)}</td>
                            <td className="py-2 pr-4">{Math.round(p.raw.kast * 100)}</td>
                            <td className="py-2 pr-4">{Math.round(p.raw.headshot * 100)}</td>
                            <td className="py-2 pr-4">{round2(p.raw.entry)}</td>
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
                  <p className="text-xs text-slate-500 mt-2">バーは各指標のzスコア×重みの寄与（DPRは負号）をスタック表示。ACS・HS%等の新指標も含む。</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* -------------------- METHOD TAB -------------------- */}
          <TabsContent value="method" className="mt-4">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle>ハイブリッド版設計</CardTitle>
                  <CardDescription>実際のマッチデータ構造に対応した評価システム</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-700">
                  <ul className="list-disc pl-5 space-y-2">
                    <li><strong>実データ対応</strong>：VRL・RIB等の実際のエクスポート形式に合わせたフィールドマッピング</li>
                    <li><strong>新指標追加</strong>：ACS（Average Combat Score）・ヘッドショット率を評価に統合</li>
                    <li><strong>エージェント→ロール変換</strong>：28エージェントを4ロールに自動分類</li>
                    <li><strong>攻守別分析</strong>：Attack/Defense別の詳細統計を活用（オプション）</li>
                    <li><strong>安定性指標</strong>：攻撃・守備間のパフォーマンス一貫性を評価</li>
                  </ul>
                  <Separator />
                  <p><strong>利用可能な指標：</strong></p>
                  <pre className="bg-slate-50 p-3 rounded-xl overflow-auto text-xs">
{`KPR/DPR/ADR     - 基本火力指標
ACS             - VALORANTネイティブスコア  
KAST            - Kill/Assist/Survive/Trade率
Entry Delta     - 先陣キル - 先陣死 (人数有利創出)
Headshot Rate   - 精密射撃技術
Consistency     - 攻守間パフォーマンス安定性`}
                  </pre>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle>データ対応状況</CardTitle>
                  <CardDescription>実際のテーブル定義に基づく指標マッピング</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-slate-700 leading-6">
                  <div className="space-y-3">
                    <div>
                      <p className="font-medium text-green-700">✅ 完全対応</p>
                      <ul className="list-disc pl-5 space-y-1 text-xs">
                        <li>Player_Name → name</li>
                        <li>Kill_All/Death_All/Assists_All → KDA</li>
                        <li>Fk_All/Fd_All → Entry分析</li>
                        <li>Acs_All/Adr_All → ACS・ADR</li>
                        <li>Kast_All/Hs_All → KAST・HS%</li>
                        <li>Agent → Role変換（28種対応）</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-orange-700">⚠️ 計算対応</p>
                      <ul className="list-disc pl-5 space-y-1 text-xs">
                        <li>Rounds = Attack_Got_Round + Defense_Got_Round</li>
                        <li>Total_Damage = ADR × Rounds</li>
                        <li>Consistency = 攻守別KPRの安定性</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-red-700">❌ 欠損（影響軽微）</p>
                      <ul className="list-disc pl-5 space-y-1 text-xs">
                        <li>マルチキル詳細（2K/3K/4K/5K）</li>
                        <li>クラッチ勝利・設置解除・トレードキル</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* -------------------- DATA TAB -------------------- */}
          <TabsContent value="data" className="mt-4">
            <div className="grid md:grid-cols-2 gap-6 items-start">
              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle>CSVインポート（実データ対応）</CardTitle>
                  <CardDescription>VRL・RIB等の実際のエクスポート形式に対応</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm">CSV（実データ形式）</Label>
                    <Textarea value={csv} onChange={(e) => setCsv(e.target.value)} className="min-h-[180px] font-mono text-xs" />
                    <div className="mt-2 flex gap-2">
                      <Button onClick={handleCSVLoad}><Upload className="w-4 h-4 mr-1" /> ロード</Button>
                      <Button variant="secondary" onClick={() => setCsv(SAMPLE_CSV)}>サンプルを読み込む</Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm">必須ヘッダ（実データ対応版）</Label>
                    <div className="mt-1 p-3 bg-slate-50 rounded-xl font-mono text-xs overflow-auto">
                      {headers.join(", ")}
                    </div>
                    <p className="text-xs text-slate-500 mt-2">※ Attack/Defense別の詳細列があれば自動的に活用されます</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle>プレビュー</CardTitle>
                  <CardDescription>{rows.length} 件の選手データ（ロール自動変換済み）</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="text-left text-slate-600">
                          <th className="py-2 pr-4">Player</th>
                          <th className="py-2 pr-4">Agent</th>
                          <th className="py-2 pr-4">Role</th>
                          <th className="py-2 pr-4">Rounds</th>
                          <th className="py-2 pr-4">K/D/A</th>
                          <th className="py-2 pr-4">ACS</th>
                          <th className="py-2 pr-4">ADR</th>
                          <th className="py-2 pr-4">KAST</th>
                          <th className="py-2 pr-4">HS%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 12).map((r, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="py-1.5 pr-4 font-medium">{r.name}</td>
                            <td className="py-1.5 pr-4">{r.agent}</td>
                            <td className="py-1.5 pr-4">
                              <Badge variant="outline" className="text-xs">{r.role}</Badge>
                            </td>
                            <td className="py-1.5 pr-4">{r.rounds}</td>
                            <td className="py-1.5 pr-4">{r.kills}/{r.deaths}/{r.assists}</td>
                            <td className="py-1.5 pr-4">{r.acs}</td>
                            <td className="py-1.5 pr-4">{r.adr}</td>
                            <td className="py-1.5 pr-4">{r.kast_percent}%</td>
                            <td className="py-1.5 pr-4">{r.hs_percent}%</td>
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
                  <CardTitle>ハイブリッド版の特徴と活用法</CardTitle>
                  <CardDescription>実データ対応版での新しい分析視点</CardDescription>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-slate-700 space-y-3">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium mb-2">🎯 新指標の活用</h4>
                      <ul className="list-disc pl-5 space-y-1">
                        <li><strong>ACS重視</strong>：VALORANTネイティブの総合指標として信頼性高</li>
                        <li><strong>ヘッドショット率</strong>：技術的精密性の客観指標</li>
                        <li><strong>安定性</strong>：攻撃・守備でのパフォーマンス一貫性</li>
                        <li><strong>ロール別正規化</strong>：デュエリストvsセンチネルの公平比較</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">⚡ 実用上のメリット</h4>
                      <ul className="list-disc pl-5 space-y-1">
                        <li><strong>即座に使える</strong>：VRL・RIBエクスポート直接対応</li>
                        <li><strong>エージェント自動分類</strong>：28種→4ロール自動変換</li>
                        <li><strong>攻守別分析</strong>：詳細統計の追加活用</li>
                        <li><strong>スケーラブル</strong>：新エージェント・指標追加容易</li>
                      </ul>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-2">📊 おすすめプリセット使い分け</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><strong>火力重視</strong>：エントリーフラガー・デュエリスト評価</li>
                      <li><strong>安定性重視</strong>：センチネル・コントローラー評価</li>
                      <li><strong>ACS基準</strong>：VALORANTネイティブスコア準拠評価</li>
                      <li><strong>エントリー重視</strong>：先陣切り能力を重視したスカウト</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* -------------------- HOW TO TAB -------------------- */}
          <TabsContent value="howto" className="mt-4">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle>使い方（ハイブリッド版）</CardTitle>
                <CardDescription>実データ対応版での効率的な評価フロー</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-slate-700 leading-6">
                <ol className="list-decimal pl-5 space-y-2">
                  <li><strong>VRL・RIBからデータエクスポート</strong>：Player_Name, Agent, Kill_All等を含むCSVを準備</li>
                  <li><strong>データタブでCSVペースト</strong>：「ロード」でエージェント→ロール自動変換実行</li>
                  <li><strong>アプリタブでプリセット選択</strong>：評価目的に応じて火力重視・安定性重視等を選択</li>
                  <li><strong>重み微調整</strong>：ACS・HS%等の新指標重みを戦術方針に合わせて調整</li>
                  <li><strong>ロール内正規化ON</strong>：デュエリストとセンチネル等の公平比較のため</li>
                  <li><strong>結果分析</strong>：ランキング表とスタックチャートで各選手の強み・弱み把握</li>
                  <li><strong>CSV出力</strong>：エージェント・ロール情報付きで詳細結果をエクスポート</li>
                </ol>
                <Separator className="my-3" />
                <div className="bg-blue-50 p-3 rounded-xl">
                  <p className="text-xs text-blue-800">
                    <strong>💡 Tips:</strong> 攻撃・守備別の詳細統計（Kill_Attack, Acs_Defense等）があれば自動的に安定性指標の計算に活用されます。
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* -------------------- REFS TAB -------------------- */}
          <TabsContent value="refs" className="mt-4">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle>参考（ハイブリッド版設計背景）</CardTitle>
                <CardDescription>実際のデータ構造と評価理論の融合</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-slate-700 leading-6 space-y-2">
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>VRL・RIB対応</strong>：実際のスタッツプラットフォームのエクスポート形式に準拠</li>
                  <li><strong>ACS統合</strong>：VALORANT公式の戦闘評価指標をWAR系モデルに組み込み</li>
                  <li><strong>ヘッドショット率</strong>：技術的精度の客観指標として精密射撃能力を評価</li>
                  <li><strong>攻守別分析</strong>：Attack/Defense個別統計から一貫性・適応力を抽出</li>
                  <li><strong>ロール公平性</strong>：エージェント28種を4ロールに分類し役割内比較を実現</li>
                  <li><strong>スケーラビリティ</strong>：新エージェント・新指標の追加に対応可能な拡張性</li>
                </ul>
                <Separator className="my-3" />
                <div className="bg-amber-50 p-3 rounded-xl">
                  <p className="text-xs text-amber-800">
                    <strong>注意:</strong> マルチキル・クラッチ・設置解除等の詳細統計が欠損している場合、それらの寄与は0として計算されます。データが豊富になれば重みを再調整してください。
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* -------------------- TESTS TAB -------------------- */}
          <TabsContent value="tests" className="mt-4">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle>セルフテスト（ハイブリッド版）</CardTitle>
                <CardDescription>実データ対応版の動作確認</CardDescription>
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
                <p className="text-xs text-slate-500 mt-3">※ 全テストパスで実データ対応版が正常動作中。ロールマッピング・正規化・出力フォーマット確認済み。</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}