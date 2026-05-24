import { Tabs } from "expo-router";
import { View, Text, StyleSheet } from "react-native";
import { House, ArrowUpRight, Clock, CreditCard, CircleUser } from "lucide-react-native";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: "rgba(12,18,28,0.95)", borderTopColor: "rgba(255,255,255,0.04)", borderTopWidth: 1, height: 72, paddingBottom: 12, paddingTop: 8, position: "absolute", bottom: 16, left: 20, right: 20, borderRadius: 24, elevation: 0, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16 },
      tabBarActiveTintColor: "#00d4aa",
      tabBarInactiveTintColor: "rgba(255,255,255,0.2)",
      tabBarShowLabel: true,
      tabBarLabelStyle: { fontSize: 10, fontWeight: "700", marginTop: 0, letterSpacing: 0.2 },
    }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <House size={22} color={color} /> }} />
      <Tabs.Screen name="send" options={{ title: "Send", tabBarIcon: ({ color }) => <ArrowUpRight size={22} color={color} /> }} />
      <Tabs.Screen name="history" options={{ title: "History", tabBarIcon: ({ color }) => <Clock size={22} color={color} /> }} />
      <Tabs.Screen name="card" options={{ title: "Card", tabBarIcon: ({ color }) => <CreditCard size={22} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color }) => <CircleUser size={22} color={color} /> }} />
    </Tabs>
  );
}
