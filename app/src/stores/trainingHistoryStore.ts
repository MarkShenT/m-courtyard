import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface TrainingHistoryRecord {
  id: string;
  adapter_path: string;
  has_weights: boolean;
  // Meta
  base_model: string;
  fine_tune_type: string;
  optimizer: string;
  iters: number;
  batch_size: number;
  lora_layers: number;
  lora_rank: number;
  lora_scale: number;
  lora_scale_strategy: string;
  lora_dropout: number;
  learning_rate: number;
  max_seq_length: number;
  grad_checkpoint: boolean;
  grad_accumulation_steps: number;
  save_every: number;
  mask_prompt: boolean;
  steps_per_eval: number;
  steps_per_report: number;
  val_batches: number;
  seed: number;
  dataset_path: string;
  train_samples: number;
  valid_samples: number;
  created_at: string;
  // Result
  status: string;
  started_at: number | null;
  completed_at: number | null;
  duration_ms: number | null;
  final_train_loss: number | null;
  final_val_loss: number | null;
  first_train_loss: number | null;
  loss_improvement_pct: number | null;
  total_iters_completed: number | null;
  train_loss_series: [number, number][];
  val_loss_series: [number, number][];
  note: string;
}

export type SortField = "date" | "loss" | "duration" | "model";
export type SortDir = "asc" | "desc";

interface TrainingHistoryState {
  records: TrainingHistoryRecord[];
  loading: boolean;
  sortField: SortField;
  sortDir: SortDir;
  filterMethod: string; // "" = all, "lora" | "dora" | "full"
  expandedId: string | null;

  // Actions
  loadHistory: (projectId: string) => Promise<void>;
  deleteRecord: (adapterId: string, adapterPath: string, projectId: string) => Promise<void>;
  batchDeleteRecords: (adapterPaths: string[], projectId: string) => Promise<void>;
  updateNote: (adapterPath: string, note: string) => Promise<void>;
  setSortField: (f: SortField) => void;
  setSortDir: (d: SortDir) => void;
  setFilterMethod: (m: string) => void;
  setExpandedId: (id: string | null) => void;
}

export const useTrainingHistoryStore = create<TrainingHistoryState>((set, get) => ({
  records: [],
  loading: false,
  sortField: "date",
  sortDir: "desc",
  filterMethod: "",
  expandedId: null,

  loadHistory: async (projectId: string) => {
    set({ loading: true });
    try {
      const records = await invoke<TrainingHistoryRecord[]>("list_training_history", { projectId });
      set({ records, loading: false });
    } catch (e) {
      console.error("Failed to load training history:", e);
      set({ records: [], loading: false });
    }
  },

  deleteRecord: async (_adapterId: string, adapterPath: string, projectId: string) => {
    try {
      await invoke("delete_adapter", { adapterPath });
      await get().loadHistory(projectId);
    } catch (e) {
      console.error("Failed to delete adapter:", e);
    }
  },

  batchDeleteRecords: async (adapterPaths: string[], projectId: string) => {
    try {
      await Promise.all(adapterPaths.map((p) => invoke("delete_adapter", { adapterPath: p })));
      await get().loadHistory(projectId);
    } catch (e) {
      console.error("Failed to batch delete adapters:", e);
    }
  },

  updateNote: async (adapterPath: string, note: string) => {
    try {
      await invoke("update_training_note", { adapterPath, note });
      // Update local state
      set((s) => ({
        records: s.records.map((r) =>
          r.adapter_path === adapterPath ? { ...r, note } : r
        ),
      }));
    } catch (e) {
      console.error("Failed to update note:", e);
    }
  },

  setSortField: (f) => set({ sortField: f }),
  setSortDir: (d) => set({ sortDir: d }),
  setFilterMethod: (m) => set({ filterMethod: m }),
  setExpandedId: (id) => set({ expandedId: id }),
}));

/** Save training result to the adapter directory via Rust backend. */
export async function saveTrainingResult(
  adapterPath: string,
  data: {
    status: string;
    started_at: number | null;
    completed_at: number | null;
    duration_ms: number | null;
    final_train_loss: number | null;
    final_val_loss: number | null;
    first_train_loss: number | null;
    loss_improvement_pct: number | null;
    total_iters_completed: number;
    train_loss_series: [number, number][];
    val_loss_series: [number, number][];
  }
): Promise<void> {
  try {
    await invoke("save_training_result", {
      adapterPath,
      resultJson: JSON.stringify(data),
    });
  } catch (e) {
    console.error("Failed to save training result:", e);
  }
}
