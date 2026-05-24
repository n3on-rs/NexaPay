import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "../src/auth/AuthContext";

export default function AppIndex() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0b0b0b", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#00d4aa" />
      </View>
    );
  }

  if (isAuthenticated) return <Redirect href="/(tabs)" />;
  return <Redirect href="/login" />;
}
