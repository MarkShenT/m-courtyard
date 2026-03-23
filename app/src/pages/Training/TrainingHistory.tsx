import { useEffect, useState, useMemo, useCallback, Fragment } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import {
  Clock, TrendingDown, BarChart3, ChevronDown, ChevronRight,
  FolderOpen, Trash2, Copy, Check, ArrowUpDown, Filter,
  FileText, History, Pencil, X, Square, CheckSquare,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useProjectStore } from "@/stores/projectStore";
import { useTrainingStore } from "@/stores/trainingStore";
import {
  useTrainingHistoryStore,
  type TrainingHistoryRecord,
  type SortField,
} from "@/stores/trainingHistoryStore";

// ─── Mini Sparkline ─────────────────────────────────────────────────

function MiniSparkline({ data, color, width = 120, height = 32 }: {
  data: [number, number][];
  color: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const values = data.map(([, v]) => v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = data.map(([, v], i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Loss Chart (full) ──────────────────────────────────────────────

function HistoryLossChart({ trainLoss, valLoss, totalIters }: {
  trainLoss: [number, number][];
  valLoss: [number, number][];
  totalIters: number;
}) {
  const { t } = useTranslation("training");
  const allPts = [...trainLoss, ...valLoss];
  if (allPts.length === 0) {
    return <p className="py-8 text-center text-xs text-muted-foreground">{t("history.card.noLoss")}</p>;
  }

  const W = 480, H = 200;
  const P = { t: 28, r: 20, b: 28, l: 52 };
  const plotW = W - P.l - P.r;
  const plotH = H - P.t - P.b;

  const maxIter = Math.max(totalIters, ...allPts.map((p) => p[0]));
  const losses = allPts.map((p) => p[1]);
  const maxL = Math.max(...losses) * 1.05;
  const minL = Math.min(...losses) * 0.95;
  const range = maxL - minL || 1;

  const sx = (i: number) => P.l + (i / (maxIter || 1)) * plotW;
  const sy = (l: number) => P.t + ((maxL - l) / range) * plotH;
  const toPoints = (pts: [number, number][]) => pts.map(([i, l]) => `${sx(i)},${sy(l)}`).join(" ");

  const yTicks = Array.from({ length: 5 }, (_, i) => minL + (range * i) / 4);
  const xTicks = Array.from({ length: 5 }, (_, i) => Math.round((maxIter * (i + 1)) / 5));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Legend – top right */}
      <g>
        <rect x={W - P.r - 130} y={4} width="8" height="8" fill="#3b82f6" rx="1" />
        <text x={W - P.r - 118} y={11} fill="currentColor" fillOpacity="0.6" fontSize="9">{t("history.sparkline.train")}</text>
        <rect x={W - P.r - 55} y={4} width="8" height="8" fill="#f59e0b" rx="1" />
        <text x={W - P.r - 43} y={11} fill="currentColor" fillOpacity="0.6" fontSize="9">{t("history.sparkline.val")}</text>
      </g>
      {/* Plot border */}
      <rect x={P.l} y={P.t} width={plotW} height={plotH} fill="none" stroke="currentColor" strokeOpacity="0.08" />
      {/* Y-axis grid + labels */}
      {yTicks.map((v, i) => (
        <g key={`y${i}`}>
          <line x1={P.l} y1={sy(v)} x2={W - P.r} y2={sy(v)} stroke="currentColor" strokeOpacity="0.08" strokeDasharray="2 3" />
          <text x={P.l - 6} y={sy(v) + 3} textAnchor="end" fill="currentColor" fillOpacity="0.45" fontSize="9">{v.toFixed(2)}</text>
        </g>
      ))}
      {/* X-axis labels */}
      {xTicks.map((v, i) => (
        <g key={`x${i}`}>
          <line x1={sx(v)} y1={P.t} x2={sx(v)} y2={P.t + plotH} stroke="currentColor" strokeOpacity="0.05" />
          <text x={sx(v)} y={P.t + plotH + 14} textAnchor="middle" fill="currentColor" fillOpacity="0.4" fontSize="9">{v}</text>
        </g>
      ))}
      {/* Lines (only when ≥ 2 points) */}
      {trainLoss.length > 1 && <polyline points={toPoints(trainLoss)} fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeLinejoin="round" />}
      {valLoss.length > 1 && <polyline points={toPoints(valLoss)} fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeDasharray="5 3" strokeLinejoin="round" />}
      {/* Data point circles (always visible, even for single point) */}
      {trainLoss.map(([i, l], idx) => <circle key={`t${idx}`} cx={sx(i)} cy={sy(l)} r="2.5" fill="#3b82f6" />)}
      {valLoss.map(([i, l], idx) => <circle key={`v${idx}`} cx={sx(i)} cy={sy(l)} r="2.5" fill="#f59e0b" />)}
    </svg>
  );
}

// ─── Duration Formatter ─────────────────────────────────────────────

function formatDuration(ms: number | null): string {
  if (ms == null || ms <= 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ─── Status Badge ───────────────────────────────────────────────────

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const styles: Record<string, string> = {
    completed: "bg-success/10 text-success border-success/30",
    failed: "bg-destructive/10 text-destructive border-destructive/30",
    stopped: "bg-warning/10 text-warning border-warning/30",
    running: "bg-info/10 text-info border-info/30",
    unknown: "bg-muted text-muted-foreground border-border",
  };
  const label = t(`history.card.${status}`) || status;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles[status] || styles.unknown}`}>
      {label}
    </span>
  );
}

function CompareLossChart({ left, right }: {
  left: TrainingHistoryRecord;
  right: TrainingHistoryRecord;
}) {
  const { t } = useTranslation("training");
  const W = 640, H = 240;
  const P = { t: 28, r: 20, b: 36, l: 52 };
  const plotW = W - P.l - P.r;
  const plotH = H - P.t - P.b;

  const COLORS = { leftTrain: "#3b82f6", leftVal: "#f59e0b", rightTrain: "#22c55e", rightVal: "#ef4444" };
  const series = [
    { key: "lt", label: `${t("history.compare.recordA")} · ${t("history.sparkline.train")}`, color: COLORS.leftTrain,  dash: undefined,  data: left.train_loss_series },
    { key: "lv", label: `${t("history.compare.recordA")} · ${t("history.sparkline.val")}`,   color: COLORS.leftVal,   dash: "5,3",      data: left.val_loss_series  },
    { key: "rt", label: `${t("history.compare.recordB")} · ${t("history.sparkline.train")}`, color: COLORS.rightTrain, dash: undefined,  data: right.train_loss_series },
    { key: "rv", label: `${t("history.compare.recordB")} · ${t("history.sparkline.val")}`,   color: COLORS.rightVal,  dash: "5,3",      data: right.val_loss_series  },
  ].filter((item) => item.data.length > 0);

  if (series.length === 0) {
    return <p className="py-10 text-center text-xs text-muted-foreground">{t("history.card.noLoss")}</p>;
  }

  const allData = series.flatMap((item) => item.data);
  const maxIter = Math.max(left.iters, right.iters, ...allData.map(([x]) => x));
  const losses = allData.map(([, y]) => y);
  const maxL = Math.max(...losses) * 1.05;
  const minL = Math.min(...losses) * 0.95;
  const range = maxL - minL || 1;

  const sx = (i: number) => P.l + (i / (maxIter || 1)) * plotW;
  const sy = (l: number) => P.t + ((maxL - l) / range) * plotH;
  const toPoints = (pts: [number, number][]) => pts.map(([i, l]) => `${sx(i)},${sy(l)}`).join(" ");

  const yTicks = Array.from({ length: 5 }, (_, i) => minL + (range * i) / 4);
  const xTicks = Array.from({ length: 5 }, (_, i) => Math.round((maxIter * (i + 1)) / 5));

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Plot border */}
        <rect x={P.l} y={P.t} width={plotW} height={plotH} fill="none" stroke="currentColor" strokeOpacity="0.08" />
        {/* Y-axis grid + labels */}
        {yTicks.map((v, i) => (
          <g key={`y${i}`}>
            <line x1={P.l} y1={sy(v)} x2={W - P.r} y2={sy(v)} stroke="currentColor" strokeOpacity="0.08" strokeDasharray="2 3" />
            <text x={P.l - 6} y={sy(v) + 3} textAnchor="end" fill="currentColor" fillOpacity="0.45" fontSize="9">{v.toFixed(2)}</text>
          </g>
        ))}
        {/* X-axis labels */}
        {xTicks.map((v, i) => (
          <g key={`x${i}`}>
            <line x1={sx(v)} y1={P.t} x2={sx(v)} y2={P.t + plotH} stroke="currentColor" strokeOpacity="0.05" />
            <text x={sx(v)} y={P.t + plotH + 14} textAnchor="middle" fill="currentColor" fillOpacity="0.4" fontSize="9">{v}</text>
          </g>
        ))}
        {/* Lines */}
        {series.map((item) => item.data.length > 1 && (
          <polyline key={item.key} points={toPoints(item.data)} fill="none" stroke={item.color}
            strokeWidth="1.75" strokeDasharray={item.dash} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {/* Dots (always, even single-point) */}
        {series.map((item) => item.data.map(([i, l], idx) => (
          <circle key={`${item.key}-${idx}`} cx={sx(i)} cy={sy(l)} r="2.5" fill={item.color} />
        )))}
      </svg>
      <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
        {series.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

interface TrainingHistoryProps {
  onApplyParams: (record: TrainingHistoryRecord) => void;
}

export function TrainingHistory({ onApplyParams }: TrainingHistoryProps) {
  const { t } = useTranslation("training");
  const { t: tc } = useTranslation("common");
  const { currentProject } = useProjectStore();
  const { status: trainingStatus, adapterPath: runningAdapterPath } = useTrainingStore();
  const {
    records, loading, sortField, sortDir, filterMethod, expandedId,
    loadHistory, deleteRecord, batchDeleteRecords, updateNote,
    setSortField, setSortDir, setFilterMethod, setExpandedId,
  } = useTrainingHistoryStore();

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<string>>(new Set());
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);

  useEffect(() => {
    if (currentProject?.id) {
      loadHistory(currentProject.id);
    }
  }, [currentProject?.id, loadHistory]);

  // Filtered & sorted records (exclude the currently running job — it has no result data yet)
  const displayRecords = useMemo(() => {
    let list = [...records];
    if (trainingStatus === "running" && runningAdapterPath) {
      list = list.filter((r) => r.adapter_path !== runningAdapterPath);
    }
    if (filterMethod) {
      list = list.filter((r) => r.fine_tune_type === filterMethod);
    }
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date":
          cmp = a.created_at.localeCompare(b.created_at);
          break;
        case "loss":
          cmp = (a.final_train_loss ?? 999) - (b.final_train_loss ?? 999);
          break;
        case "duration":
          cmp = (a.duration_ms ?? 0) - (b.duration_ms ?? 0);
          break;
        case "model":
          cmp = a.base_model.localeCompare(b.base_model);
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return list;
  }, [records, filterMethod, sortField, sortDir, trainingStatus, runningAdapterPath]);

  const handleDelete = useCallback(async (record: TrainingHistoryRecord) => {
    if (!currentProject?.id) return;
    await deleteRecord(record.id, record.adapter_path, currentProject.id);
    setDeleteConfirmId(null);
  }, [currentProject?.id, deleteRecord]);

  const handleApplyParams = useCallback((record: TrainingHistoryRecord) => {
    onApplyParams(record);
    setAppliedId(record.id);
    setTimeout(() => setAppliedId(null), 2000);
  }, [onApplyParams]);

  const handleSaveNote = useCallback(async (record: TrainingHistoryRecord) => {
    await updateNote(record.adapter_path, noteText);
    setEditingNoteId(null);
  }, [noteText, updateNote]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setSortDropdownOpen(false);
  };

  const modelShort = (model: string) => {
    const parts = model.split("/");
    return parts[parts.length - 1] || model;
  };

  const selectedCompareRecords = useMemo(
    () => selectedCompareIds
      .map((id) => records.find((record) => record.id === id))
      .filter((record): record is TrainingHistoryRecord => !!record),
    [records, selectedCompareIds]
  );

  const handleBatchDelete = useCallback(async () => {
    if (!currentProject?.id || selectedDeleteIds.size === 0) return;
    const paths = displayRecords
      .filter((r) => selectedDeleteIds.has(r.id))
      .map((r) => r.adapter_path);
    await batchDeleteRecords(paths, currentProject.id);
    setSelectedDeleteIds(new Set());
    setBatchDeleteConfirm(false);
  }, [currentProject?.id, selectedDeleteIds, displayRecords, batchDeleteRecords]);

  const toggleDeleteSelection = useCallback((recordId: string) => {
    setSelectedDeleteIds((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  }, []);

  const isAllSelected = displayRecords.length > 0 && displayRecords.every((r) => selectedDeleteIds.has(r.id));

  const toggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedDeleteIds(new Set());
    } else {
      setSelectedDeleteIds(new Set(displayRecords.map((r) => r.id)));
    }
  }, [isAllSelected, displayRecords]);

  const toggleCompareSelection = useCallback((recordId: string) => {
    setSelectedCompareIds((prev) => {
      if (prev.includes(recordId)) return prev.filter((id) => id !== recordId);
      if (prev.length < 2) return [...prev, recordId];
      return [prev[1], recordId];
    });
  }, []);

  const compareFields = useMemo(() => {
    if (selectedCompareRecords.length !== 2) return [] as Array<{ label: string; left: string; right: string; different: boolean }>;
    const [left, right] = selectedCompareRecords;
    const rows = [
      { label: t("history.detail.model"), left: left.base_model, right: right.base_model },
      { label: t("history.detail.method"), left: left.fine_tune_type.toUpperCase(), right: right.fine_tune_type.toUpperCase() },
      { label: t("history.detail.optimizer"), left: left.optimizer, right: right.optimizer },
      { label: t("history.detail.iters"), left: String(left.iters), right: String(right.iters) },
      { label: t("history.detail.batchSize"), left: String(left.batch_size), right: String(right.batch_size) },
      { label: t("history.detail.learningRate"), left: String(left.learning_rate), right: String(right.learning_rate) },
      { label: t("history.detail.loraLayers"), left: String(left.lora_layers), right: String(right.lora_layers) },
      { label: t("history.detail.loraRank"), left: String(left.lora_rank), right: String(right.lora_rank) },
      { label: t("history.detail.loraScale"), left: String(left.lora_scale), right: String(right.lora_scale) },
      { label: t("history.detail.loraScaleStrategy"), left: left.lora_scale_strategy, right: right.lora_scale_strategy },
      { label: t("history.detail.loraDropout"), left: String(left.lora_dropout), right: String(right.lora_dropout) },
      { label: t("history.detail.maxSeqLength"), left: String(left.max_seq_length), right: String(right.max_seq_length) },
      { label: t("history.detail.gradCheckpoint"), left: left.grad_checkpoint ? t("history.detail.on") : t("history.detail.off"), right: right.grad_checkpoint ? t("history.detail.on") : t("history.detail.off") },
      { label: t("history.detail.gradAccumulation"), left: String(left.grad_accumulation_steps), right: String(right.grad_accumulation_steps) },
      { label: t("history.detail.maskPrompt"), left: left.mask_prompt ? t("history.detail.on") : t("history.detail.off"), right: right.mask_prompt ? t("history.detail.on") : t("history.detail.off") },
      { label: t("history.detail.saveEvery"), left: String(left.save_every), right: String(right.save_every) },
      { label: t("history.detail.stepsPerEval"), left: String(left.steps_per_eval), right: String(right.steps_per_eval) },
      { label: t("history.detail.stepsPerReport"), left: String(left.steps_per_report), right: String(right.steps_per_report) },
      { label: t("history.detail.valBatches"), left: String(left.val_batches), right: String(right.val_batches) },
      { label: t("history.detail.seed"), left: String(left.seed), right: String(right.seed) },
      { label: t("history.detail.trainSamples"), left: String(left.train_samples), right: String(right.train_samples) },
      { label: t("history.detail.validSamples"), left: String(left.valid_samples), right: String(right.valid_samples) },
      { label: t("history.detail.dataset"), left: left.dataset_path || "-", right: right.dataset_path || "-" },
    ];
    return rows.map((row) => ({ ...row, different: row.left !== row.right }));
  }, [selectedCompareRecords, t]);

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <p className="mt-3 text-xs">{t("history.loading")}</p>
      </div>
    );
  }

  // Empty state
  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
          <History size={28} className="text-muted-foreground/50" />
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">{t("history.empty")}</p>
        <p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">{t("history.emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {selectedCompareRecords.length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden">
          <div className="flex items-center justify-between border-b border-primary/10 px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t("history.compare.title")}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {selectedCompareRecords.length === 1
                  ? t("history.compare.needTwo")
                  : t("history.compare.ready")}
              </p>
            </div>
            <button
              onClick={() => setSelectedCompareIds([])}
              className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent"
            >
              {t("history.compare.clear")}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-primary/10">
            {selectedCompareRecords.map((record, index) => (
              <span key={record.id} className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground">
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${index === 0 ? "bg-info/15 text-info" : "bg-success/15 text-success"}`}>
                  {index + 1}
                </span>
                {modelShort(record.base_model)}
              </span>
            ))}
          </div>

          {selectedCompareRecords.length === 2 && (
            <div className="grid gap-4 p-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-md border border-border/60 bg-background/60 p-3">
                <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <BarChart3 size={12} /> {t("history.compare.lossOverlay")}
                </h4>
                <CompareLossChart left={selectedCompareRecords[0]} right={selectedCompareRecords[1]} />
              </div>

              <div className="rounded-md border border-border/60 bg-background/60 p-3">
                <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <FileText size={12} /> {t("history.compare.paramsDiff")}
                </h4>
                <div className="grid grid-cols-[140px_1fr_1fr_auto] gap-px overflow-hidden rounded-md border border-border/60 bg-border/30 text-[11px]">
                  <div className="bg-card px-3 py-2 font-medium text-muted-foreground">{t("history.compare.field")}</div>
                  <div className="bg-card px-3 py-2 font-medium text-info">{t("history.compare.recordA")}</div>
                  <div className="bg-card px-3 py-2 font-medium text-success">{t("history.compare.recordB")}</div>
                  <div className="bg-card px-3 py-2 font-medium text-muted-foreground">{t("history.compare.status")}</div>
                  {compareFields.map((row) => (
                    <Fragment key={row.label}>
                      <div className={`bg-card px-3 py-2 text-muted-foreground ${row.different ? "bg-warning/5" : ""}`}>{row.label}</div>
                      <div className={`bg-card px-3 py-2 text-foreground break-all ${row.different ? "bg-warning/5 font-medium" : ""}`}>{row.left}</div>
                      <div className={`bg-card px-3 py-2 text-foreground break-all ${row.different ? "bg-warning/5 font-medium" : ""}`}>{row.right}</div>
                      <div className="bg-card px-3 py-2 text-right">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${row.different ? "border-warning/30 bg-warning/10 text-warning" : "border-border text-muted-foreground"}`}>
                          {row.different ? t("history.compare.different") : t("history.compare.same")}
                        </span>
                      </div>
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Batch delete toolbar — visible when any records are selected */}
      {selectedDeleteIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">
              {t("history.actions.batchSelected", { count: selectedDeleteIds.size })}
            </span>
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {isAllSelected ? <CheckSquare size={13} /> : <Square size={13} />}
              {isAllSelected ? t("history.actions.deselectAll") : t("history.actions.selectAll")}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {batchDeleteConfirm ? (
              <>
                <span className="text-xs text-destructive">
                  {t("history.actions.batchDeleteConfirm", { count: selectedDeleteIds.size })}
                </span>
                <button
                  onClick={handleBatchDelete}
                  className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
                >
                  {t("history.actions.batchDeleteConfirmBtn")}
                </button>
                <button
                  onClick={() => setBatchDeleteConfirm(false)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
                >
                  {t("history.actions.batchCancel")}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setBatchDeleteConfirm(true)}
                  className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors"
                >
                  <Trash2 size={12} />
                  {t("history.actions.batchDelete")}
                </button>
                <button
                  onClick={() => setSelectedDeleteIds(new Set())}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
                >
                  {t("history.actions.batchCancel")}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toolbar: count + sort + filter */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {t("history.recordCount", { count: displayRecords.length })}
        </p>
        <div className="flex items-center gap-2">
          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => { setSortDropdownOpen(!sortDropdownOpen); setFilterDropdownOpen(false); }}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent"
            >
              <ArrowUpDown size={12} />
              {t("history.sort.label")}: {t(`history.sort.${sortField}`)}
              {sortDir === "asc" ? " ↑" : " ↓"}
            </button>
            {sortDropdownOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-lg border border-border bg-background p-1.5 shadow-lg">
                {(["date", "loss", "duration", "model"] as SortField[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => toggleSort(f)}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                      sortField === f ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {t(`history.sort.${f}`)}
                    {sortField === f && <span className="ml-auto text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Filter dropdown */}
          <div className="relative">
            <button
              onClick={() => { setFilterDropdownOpen(!filterDropdownOpen); setSortDropdownOpen(false); }}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-accent ${
                filterMethod ? "border-primary text-primary" : "border-border text-muted-foreground"
              }`}
            >
              <Filter size={12} />
              {filterMethod ? t(`history.filter.${filterMethod}`) : t("history.filter.all")}
            </button>
            {filterDropdownOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-lg border border-border bg-background p-1.5 shadow-lg">
                {[{ key: "", label: t("history.filter.all") }, { key: "lora", label: "LoRA" }, { key: "dora", label: "DoRA" }, { key: "full", label: "Full" }].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { setFilterMethod(key); setFilterDropdownOpen(false); }}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                      filterMethod === key ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Records list */}
      <div className="space-y-3">
        {displayRecords.map((record) => {
          const isExpanded = expandedId === record.id;
          const isLoraLike = record.fine_tune_type === "lora" || record.fine_tune_type === "dora";
          const compareIndex = selectedCompareIds.indexOf(record.id);
          const isSelectedForCompare = compareIndex >= 0;
          const isSelectedForDelete = selectedDeleteIds.has(record.id);

          return (
            <div
              key={record.id}
              className={`rounded-lg border bg-card overflow-hidden transition-all duration-200 ${
                isSelectedForDelete
                  ? "border-destructive/40 ring-1 ring-destructive/10"
                  : isSelectedForCompare
                  ? "border-primary/50 ring-1 ring-primary/20"
                  : "border-border"
              }`}
            >
              {/* Card Header */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : record.id)}
              >
                {/* Batch-delete checkbox */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleDeleteSelection(record.id); }}
                  className={`shrink-0 transition-colors ${
                    isSelectedForDelete ? "text-destructive" : "text-muted-foreground/40 hover:text-muted-foreground"
                  }`}
                  title={t("history.actions.batchSelect")}
                >
                  {isSelectedForDelete ? <CheckSquare size={15} /> : <Square size={15} />}
                </button>
                {/* Compare button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCompareSelection(record.id);
                  }}
                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold transition-colors ${isSelectedForCompare ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/40"}`}
                  title={t("history.compare.pick")}
                >
                  {isSelectedForCompare ? compareIndex + 1 : "+"}
                </button>
                {/* Expand icon */}
                <div className="shrink-0 text-muted-foreground">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>

                {/* Mini sparkline */}
                <div className="shrink-0">
                  {record.train_loss_series.length >= 2 ? (
                    <MiniSparkline data={record.train_loss_series} color="hsl(var(--info))" width={80} height={28} />
                  ) : (
                    <div className="flex h-7 w-20 items-center justify-center rounded bg-muted/30 text-[9px] text-muted-foreground">
                      {t("history.card.noLoss")}
                    </div>
                  )}
                </div>

                {/* Main info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground" title={record.base_model}>
                      {modelShort(record.base_model)}
                    </span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
                      {record.fine_tune_type}
                    </span>
                    <StatusBadge status={record.status} t={t} />
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{record.created_at}</span>
                    {record.total_iters_completed != null && (
                      <span>{t("history.card.iters", { completed: record.total_iters_completed, total: record.iters })}</span>
                    )}
                    {record.note && (
                      <span className="truncate max-w-[150px] italic" title={record.note}>📝 {record.note}</span>
                    )}
                  </div>
                </div>

                {/* Metrics summary */}
                <div className="hidden shrink-0 items-center gap-4 text-xs lg:flex">
                  <div className="text-right">
                    <p className="text-[10px] uppercase text-muted-foreground">{t("history.card.duration")}</p>
                    <p className="font-mono font-medium text-foreground">{formatDuration(record.duration_ms)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase text-muted-foreground">{t("history.card.trainLoss")}</p>
                    <p className="font-mono font-medium text-foreground">
                      {record.final_train_loss != null ? record.final_train_loss.toFixed(4) : t("history.card.noData")}
                    </p>
                  </div>
                  {record.loss_improvement_pct != null && (
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-muted-foreground">{t("history.card.improvement")}</p>
                      <p className={`font-mono font-medium ${record.loss_improvement_pct > 0 ? "text-success" : "text-destructive"}`}>
                        {record.loss_improvement_pct > 0 ? "↓" : "↑"} {Math.abs(record.loss_improvement_pct).toFixed(1)}%
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Expanded Detail */}
              {isExpanded && (
                <div className="border-t border-border">
                  {/* Metrics grid (visible on mobile when expanded) */}
                  <div className="grid grid-cols-2 gap-px bg-border/30 lg:grid-cols-4">
                    <div className="bg-card px-4 py-2.5 space-y-0.5">
                      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <Clock size={10} /> {t("history.card.duration")}
                      </p>
                      <p className="text-sm font-semibold text-foreground font-mono">{formatDuration(record.duration_ms)}</p>
                    </div>
                    <div className="bg-card px-4 py-2.5 space-y-0.5">
                      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <TrendingDown size={10} /> {t("history.card.trainLoss")}
                      </p>
                      <p className="text-sm font-semibold text-foreground font-mono">
                        {record.final_train_loss != null ? record.final_train_loss.toFixed(4) : t("history.card.noData")}
                      </p>
                    </div>
                    <div className="bg-card px-4 py-2.5 space-y-0.5">
                      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <BarChart3 size={10} /> {t("history.card.valLoss")}
                      </p>
                      <p className="text-sm font-semibold text-foreground font-mono">
                        {record.final_val_loss != null ? record.final_val_loss.toFixed(4) : t("history.card.noData")}
                      </p>
                    </div>
                    <div className="bg-card px-4 py-2.5 space-y-0.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("history.card.improvement")}</p>
                      <p className={`text-sm font-semibold font-mono ${
                        record.loss_improvement_pct != null && record.loss_improvement_pct > 0 ? "text-success" : "text-foreground"
                      }`}>
                        {record.loss_improvement_pct != null
                          ? `${record.loss_improvement_pct > 0 ? "↓" : "↑"} ${Math.abs(record.loss_improvement_pct).toFixed(1)}%`
                          : t("history.card.noData")}
                      </p>
                    </div>
                  </div>

                  {/* Loss chart + params side by side */}
                  <div className="grid gap-4 p-4 lg:grid-cols-2">
                    {/* Loss chart */}
                    <div className="rounded-md border border-border/60 bg-background/50 p-3">
                      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <BarChart3 size={12} /> {t("history.detail.lossChart")}
                      </h4>
                      <HistoryLossChart trainLoss={record.train_loss_series} valLoss={record.val_loss_series} totalIters={record.iters} />
                    </div>

                    {/* Parameters table */}
                    <div className="rounded-md border border-border/60 bg-background/50 p-3">
                      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <FileText size={12} /> {t("history.detail.params")}
                      </h4>
                      <div className="space-y-1 text-[11px]">
                        <ParamRow label={t("history.detail.model")} value={record.base_model} mono truncate />
                        <ParamRow label={t("history.detail.method")} value={record.fine_tune_type.toUpperCase()} />
                        <ParamRow label={t("history.detail.optimizer")} value={record.optimizer} />
                        <ParamRow label={t("history.detail.iters")} value={String(record.iters)} />
                        <ParamRow label={t("history.detail.batchSize")} value={String(record.batch_size)} />
                        <ParamRow label={t("history.detail.learningRate")} value={String(record.learning_rate)} mono />
                        {isLoraLike && (
                          <>
                            <ParamRow label={t("history.detail.loraLayers")} value={String(record.lora_layers)} />
                            <ParamRow label={t("history.detail.loraRank")} value={String(record.lora_rank)} />
                            <ParamRow label={t("history.detail.loraScale")} value={String(record.lora_scale)} />
                            <ParamRow label={t("history.detail.loraScaleStrategy")} value={record.lora_scale_strategy} />
                            <ParamRow label={t("history.detail.loraDropout")} value={String(record.lora_dropout)} />
                          </>
                        )}
                        <ParamRow label={t("history.detail.maxSeqLength")} value={String(record.max_seq_length)} />
                        <ParamRow label={t("history.detail.gradCheckpoint")} value={record.grad_checkpoint ? t("history.detail.on") : t("history.detail.off")} />
                        <ParamRow label={t("history.detail.gradAccumulation")} value={String(record.grad_accumulation_steps)} />
                        <ParamRow label={t("history.detail.maskPrompt")} value={record.mask_prompt ? t("history.detail.on") : t("history.detail.off")} />
                        <ParamRow label={t("history.detail.seed")} value={String(record.seed)} />
                        <ParamRow label={t("history.detail.trainSamples")} value={String(record.train_samples)} />
                        <ParamRow label={t("history.detail.validSamples")} value={String(record.valid_samples)} />
                      </div>
                    </div>
                  </div>

                  {/* Note section */}
                  <div className="border-t border-border/50 px-4 py-2.5">
                    {editingNoteId === record.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveNote(record); if (e.key === "Escape") setEditingNoteId(null); }}
                          placeholder={t("history.note.placeholder")}
                          className="flex-1 rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          autoFocus
                        />
                        <button onClick={() => handleSaveNote(record)} className="rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:bg-primary/90">
                          {t("history.note.save")}
                        </button>
                        <button onClick={() => setEditingNoteId(null)} className="p-1 text-muted-foreground hover:text-foreground">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingNoteId(record.id); setNoteText(record.note || ""); }}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil size={11} />
                        {record.note || t("history.note.placeholder")}
                      </button>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 border-t border-border/50 px-4 py-2.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleApplyParams(record); }}
                          className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                            appliedId === record.id
                              ? "border-success/30 bg-success/10 text-success"
                              : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                          }`}
                        >
                          {appliedId === record.id ? <Check size={12} /> : <Copy size={12} />}
                          {appliedId === record.id ? t("history.actions.copied") : t("history.actions.applyParams")}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{t("history.actions.applyParamsHint")}</TooltipContent>
                    </Tooltip>

                    {record.has_weights && (
                      <button
                        onClick={(e) => { e.stopPropagation(); invoke("open_adapter_folder", { adapterPath: record.adapter_path }); }}
                        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
                      >
                        <FolderOpen size={12} /> {t("history.actions.openFolder")}
                      </button>
                    )}

                    {deleteConfirmId === record.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-destructive">{t("history.actions.deleteConfirm")}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(record); }}
                          className="rounded-md bg-destructive px-2.5 py-1 text-xs text-destructive-foreground hover:bg-destructive/90"
                        >
                          {t("history.actions.delete")}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          {tc("cancel") || "Cancel"}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(record.id); }}
                        className="flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
                      >
                        <Trash2 size={12} /> {t("history.actions.delete")}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Helper: Param Row ──────────────────────────────────────────────

function ParamRow({ label, value, mono, truncate }: {
  label: string; value: string; mono?: boolean; truncate?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`text-foreground ${mono ? "font-mono" : ""} ${truncate ? "truncate max-w-[200px]" : ""}`} title={truncate ? value : undefined}>
        {value}
      </span>
    </div>
  );
}
