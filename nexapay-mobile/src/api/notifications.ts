import { Platform } from "react-native";

// Note: expo-notifications requires a development build, not Expo Go.
// Use `npx expo run:android` instead of `npx expo start`.
// In Expo Go, push notifications are silently disabled.

export async function registerForPushNotifications(): Promise<string | null> {
  try {
    const { default: Notifications } = await import("expo-notifications");

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") return null;

    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("default", {
        name: "NexaPay",
        importance: Notifications.AndroidImportance?.MAX ?? 4,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    return token;
  } catch {
    // expo-notifications not available in Expo Go — requires development build
    return null;
  }
}
