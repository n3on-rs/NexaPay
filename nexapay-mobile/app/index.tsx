import { Redirect } from "expo-router";
import { View, ActivityIndicator, Text } from "react-native";
import { useAuth } from "../src/auth/AuthContext";

export default function AppIndex() {
  const { isAuthenticated, isLoading } = useAuth();

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

  if (!isAuthenticated) return <Redirect href="/login" />;
  return <Redirect href="/(tabs)" />;
}
