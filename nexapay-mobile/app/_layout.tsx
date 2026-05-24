import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../src/auth/AuthContext";
import { AuthGuard } from "../src/auth/guard";

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <AuthGuard>
        <Stack screenOptions={{
          headerShown: false,
          animation: "fade_from_bottom",
          contentStyle: { backgroundColor: "#0A0A14" },
        }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" options={{ animation: "fade" }} />
          <Stack.Screen name="register" />
          <Stack.Screen name="docs" />
        </Stack>
      </AuthGuard>
    </AuthProvider>
  );
}
