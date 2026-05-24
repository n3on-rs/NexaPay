import { View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import { router, usePathname, useSegments } from "expo-router";
import { useAuth } from "./AuthContext";
import { useEffect } from "react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === "login" || segments[0] === "register" || segments[0] === "docs";

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to login
      router.replace("/login");
    } else if (isAuthenticated && inAuthGroup) {
      // Already logged in, go home
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0A0A14", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: "rgba(255,107,53,0.1)", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(255,107,53,0.15)" }}>
          <ActivityIndicator size="small" color="#FF6B35" />
        </View>
        <Text style={{ color: "rgba(255,255,255,0.25)", fontSize: 13, fontWeight: "600" }}>Loading NexaPay</Text>
      </View>
    );
  }

  return <>{children}</>;
}
