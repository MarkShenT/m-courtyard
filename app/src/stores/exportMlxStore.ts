import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface MlxEvent {
  project_id?: string;
  [key: string]: unknown;
}

interface ExportMlxState {
  isExporting: boolean;
  result: string | null;
  logs: string[];
  currentStep: string;
  progress: string;
  outputDir: string;
  sizeMb: number;
  activeProjectId: string;

  startExport: (projectId: string) => void;
  setResult: (r: string | null) => void;
  addLog: (line: string) => void;
  setProgress: (desc: string) => void;
  setCurrentStep: (step: string) => void;
  setOutputDir: (dir: string) => void;
  setSizeMb: (size: number) => void;
  clearAll: () => void;

  _listenersReady: boolean;
  _initPromise: Promise<void> | null;
  _unlistens: UnlistenFn[];
  initListeners: () => Promise<void>;
}

export const useExportMlxStore = create<ExportMlxState>((set, get) => ({
  isExporting: false,
  result: null,
  logs: [],
  currentStep: "",
  progress: "",
  outputDir: "",
  sizeMb: 0,
  activeProjectId: "",

  startExport: (projectId) => set({
    isExporting: true, result: null, logs: [], currentStep: "",
    progress: "", outputDir: "", sizeMb: 0, activeProjectId: projectId,
  }),

  setResult: (r) => set({ result: r }),
  addLog: (line) => set((s) => ({ logs: [...s.logs, line] })),
  setProgress: (desc) => set({ progress: desc }),
  setCurrentStep: (step) => set({ currentStep: step }),
  setOutputDir: (dir) => set({ outputDir: dir }),
  setSizeMb: (size) => set({ sizeMb: size }),

  clearAll: () => set({
    isExporting: false, result: null, logs: [], currentStep: "",
    progress: "", outputDir: "", sizeMb: 0, activeProjectId: "",
  }),

  _listenersReady: false,
  _initPromise: null,
  _unlistens: [],

  initListeners: async () => {
    if (get()._listenersReady) return;
    if (get()._initPromise) return get()._initPromise as Promise<void>;

    const setupPromise = (async () => {
      const unsubs: UnlistenFn[] = [];

      const isMyProject = (payload: MlxEvent) => {
        const active = get().activeProjectId;
        if (!active) return true;
        return payload.project_id === active;
      };

      const u1 = await listen<MlxEvent & { step?: string; desc?: string }>("mlx:progress", (e) => {
        if (!isMyProject(e.payload)) return;
        const desc = (e.payload.desc as string) || "";
        const step = (e.payload.step as string) || "";
        if (desc) get().setProgress(desc);
        if (step) get().setCurrentStep(step);
        if (desc) {
          const ts = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
          get().addLog(`[${ts}] ${desc}`);
        }
      });
      unsubs.push(u1);

      const u2 = await listen<MlxEvent & { output_dir?: string; size_mb?: number }>("mlx:complete", (e) => {
        if (!isMyProject(e.payload)) return;
        const dir = (e.payload.output_dir as string) || "";
        const sizeMb = (e.payload.size_mb as number) || 0;
        if (dir) get().setOutputDir(dir);
        if (sizeMb) get().setSizeMb(sizeMb);
        set({ isExporting: false, currentStep: "done", progress: "" });
        set({ result: `__success__:${dir}` });
        get().addLog(`--- MLX model exported to ${dir}`);
        import("./notificationStore").then(({ useNotificationStore }) => {
          useNotificationStore.getState().trigger("export_complete", "M-Courtyard", `MLX export completed.`);
        });
      });
      unsubs.push(u2);

      const u3 = await listen<MlxEvent & { message?: string }>("mlx:error", (e) => {
        if (!isMyProject(e.payload)) return;
        const msg = (e.payload.message as string) || "MLX export failed";
        set({ isExporting: false, currentStep: "", progress: "" });
        set({ result: `Error: ${msg}` });
        get().addLog(`!!! Error: ${msg}`);
        import("./notificationStore").then(({ useNotificationStore }) => {
          useNotificationStore.getState().trigger("export_failed", "M-Courtyard", `MLX export failed: ${msg}`);
        });
      });
      unsubs.push(u3);

      set({ _unlistens: unsubs, _listenersReady: true });
    })();

    set({ _initPromise: setupPromise });

    try {
      await setupPromise;
    } finally {
      set({ _initPromise: null });
    }
  },
}));
