import { Redirect } from "expo-router";
import { View, ActivityIndicator, Text } from "react-native";
import { useAuth } from "../src/auth/AuthContext";

export default function AppIndex() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#030712", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: "rgba(0,212,170,0.1)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(0,212,170,0.2)" }}>
          <ActivityIndicator size="large" color="#00d4aa" />
        </View>
        <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, fontWeight: "500" }}>Loading NexaPay</Text>
      </View>
    );
  }

  if (isAuthenticated) return <Redirect href="/(tabs)" />;
  return <Redirect href="/login" />;
}
