import { invoke } from "@tauri-apps/api/core";

export type NativeNotificationPermission =
  | "granted"
  | "denied"
  | "default"
  | "unsupported";

export interface NativeNotificationPayload {
  title: string;
  body: string;
  sound?: string;
  group?: string;
}

export interface NativeNotificationResult {
  delivered: boolean;
  permission: NativeNotificationPermission;
  error?: string;
}

export async function getNativeNotificationPermission(): Promise<NativeNotificationPermission> {
  try {
    return await invoke<NativeNotificationPermission>("get_native_notification_permission");
  } catch {
    return "unsupported";
  }
}

export async function requestNativeNotificationPermission(): Promise<NativeNotificationPermission> {
  try {
    return await invoke<NativeNotificationPermission>("request_native_notification_permission");
  } catch {
    return "unsupported";
  }
}

export async function sendNativeNotification(
  payload: NativeNotificationPayload
): Promise<NativeNotificationResult> {
  try {
    const permission = await getNativeNotificationPermission();
    if (permission !== "granted") {
      return { delivered: false, permission, error: `permission:${permission}` };
    }

    await invoke("send_native_notification", {
      title: payload.title,
      body: payload.body,
      sound: payload.sound ?? "Ping",
      group: payload.group,
    });

    return { delivered: true, permission };
  } catch (error) {
    return {
      delivered: false,
      permission: "unsupported",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
