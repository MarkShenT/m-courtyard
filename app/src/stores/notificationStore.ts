import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import {
  addNotificationHistory,
  clearNotificationHistory,
  listNotificationHistory,
  markAllNotificationHistoryRead,
  markNotificationHistoryRead,
  type NotificationHistoryItem,
} from "@/services/notificationHistory";
import {
  getNativeNotificationPermission,
  requestNativeNotificationPermission,
  sendNativeNotification,
  type NativeNotificationPermission,
} from "@/services/nativeNotification";

export type ChannelType =
  | "webhook"
  | "slack"
  | "discord"
  | "telegram"
  | "feishu"
  | "wecom"
  | "ntfy"
  | "bark"
  | "pushover";

export interface NotificationChannel {
  id: string;
  type: ChannelType;
  name: string;
  enabled: boolean;
  url?: string;
  token?: string;
  chat_id?: string;
  user_key?: string;
  key?: string;
}

export interface NotificationEvents {
  training_complete: boolean;
  training_failed: boolean;
  export_complete: boolean;
  export_failed: boolean;
  dataset_complete: boolean;
  dataset_failed: boolean;
}

export interface NotificationConfig {
  channels: NotificationChannel[];
  events: NotificationEvents;
}

const DEFAULT_EVENTS: NotificationEvents = {
  training_complete: true,
  training_failed: true,
  export_complete: true,
  export_failed: true,
  dataset_complete: true,
  dataset_failed: true,
};

const HISTORY_LIMIT = 50;
export const DEFAULT_NATIVE_NOTIFICATION_SOUND = "Glass";

function makeHistoryId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getUnreadCount(history: NotificationHistoryItem[]) {
  return history.filter((item) => !item.read_at).length;
}

export async function dispatchToChannel(
  channel: NotificationChannel,
  title: string,
  body: string
): Promise<void> {
  const message = `${title}\n${body}`;
  switch (channel.type) {
      case "webhook": {
        await fetch(channel.url!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, body }),
        });
        break;
      }
      case "slack": {
        await fetch(channel.url!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: message }),
        });
        break;
      }
      case "discord": {
        await fetch(channel.url!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: message }),
        });
        break;
      }
      case "telegram": {
        await fetch(
          `https://api.telegram.org/bot${channel.token}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: channel.chat_id, text: message }),
          }
        );
        break;
      }
      case "feishu": {
        await fetch(channel.url!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            msg_type: "text",
            content: { text: message },
          }),
        });
        break;
      }
      case "wecom": {
        await fetch(channel.url!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ msgtype: "text", text: { content: message } }),
        });
        break;
      }
      case "ntfy": {
        await fetch(channel.url!, {
          method: "POST",
          headers: { "Content-Type": "text/plain", Title: title },
          body: body,
        });
        break;
      }
      case "bark": {
        const base = (channel.url ?? "").replace(/\/$/, "");
        await fetch(
          `${base}/${encodeURIComponent(channel.key!)}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`,
          { method: "GET" }
        );
        break;
      }
      case "pushover": {
        const fd = new FormData();
        fd.append("token", channel.token!);
        fd.append("user", channel.user_key!);
        fd.append("title", title);
        fd.append("message", body);
        await fetch("https://api.pushover.net/1/messages.json", {
          method: "POST",
          body: fd,
        });
        break;
      }
    }
}

interface NotificationStore {
  config: NotificationConfig;
  history: NotificationHistoryItem[];
  unreadCount: number;
  permission: NativeNotificationPermission;
  lastNativeError: string | null;
  loaded: boolean;
  load: () => Promise<void>;
  save: (config: NotificationConfig) => Promise<void>;
  refreshHistory: () => Promise<void>;
  requestNativePermission: () => Promise<NativeNotificationPermission>;
  markHistoryRead: (id: string) => Promise<void>;
  markAllHistoryRead: () => Promise<void>;
  clearHistory: () => Promise<void>;
  trigger: (event: keyof NotificationEvents, title: string, body: string) => Promise<void>;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  config: { channels: [], events: { ...DEFAULT_EVENTS } },
  history: [],
  unreadCount: 0,
  permission: "default",
  lastNativeError: null,
  loaded: false,

  load: async () => {
    try {
      const [cfg, history, permission] = await Promise.all([
        invoke<NotificationConfig>("get_notification_config").catch(() => ({
          channels: [],
          events: { ...DEFAULT_EVENTS },
        })),
        listNotificationHistory(HISTORY_LIMIT).catch(() => []),
        getNativeNotificationPermission(),
      ]);

      set({
        config: {
          channels: cfg.channels ?? [],
          events: { ...DEFAULT_EVENTS, ...(cfg.events ?? {}) },
        },
        history,
        unreadCount: getUnreadCount(history),
        permission,
        lastNativeError: null,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  save: async (config) => {
    await invoke("save_notification_config", { config });
    set({ config });
  },

  refreshHistory: async () => {
    const history = await listNotificationHistory(HISTORY_LIMIT);
    set({ history, unreadCount: getUnreadCount(history) });
  },

  requestNativePermission: async () => {
    const permission = await requestNativeNotificationPermission();
    set({ permission, lastNativeError: permission === "granted" ? null : `permission:${permission}` });
    return permission;
  },

  markHistoryRead: async (id) => {
    await markNotificationHistoryRead(id);
    await get().refreshHistory();
  },

  markAllHistoryRead: async () => {
    await markAllNotificationHistoryRead();
    await get().refreshHistory();
  },

  clearHistory: async () => {
    await clearNotificationHistory();
    set({ history: [], unreadCount: 0 });
  },

  trigger: async (event, title, body) => {
    const { config } = get();
    if (!config.events[event]) return;

    const nativeResult = await sendNativeNotification({
      title,
      body,
      sound: DEFAULT_NATIVE_NOTIFICATION_SOUND,
      group: event,
    });

    set({
      permission: nativeResult.permission,
      lastNativeError: nativeResult.error ?? null,
    });

    if (!nativeResult.delivered && nativeResult.error) {
      console.warn("[Notification] native notification failed:", nativeResult.error);
    }

    try {
      await addNotificationHistory({
        id: makeHistoryId(),
        event_key: event,
        title,
        body,
        native_delivered: nativeResult.delivered,
        sound: nativeResult.delivered ? DEFAULT_NATIVE_NOTIFICATION_SOUND : null,
      });
      await get().refreshHistory();
    } catch (error) {
      console.warn("[Notification] failed to persist history:", error);
    }

    await Promise.allSettled(
      config.channels
        .filter((channel) => channel.enabled)
        .map((channel) =>
          dispatchToChannel(channel, title, body).catch((error) => {
            console.warn(`[Notification] channel "${channel.name}" error:`, error);
          })
        )
    );
  },
}));
