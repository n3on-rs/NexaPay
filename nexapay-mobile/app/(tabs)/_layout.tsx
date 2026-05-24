import { Tabs } from "expo-router";
import { Home, ArrowUpRight, Clock, CreditCard, User } from "lucide-react-native";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: "#0d0d0d", borderTopColor: "rgba(255,255,255,0.06)", height: 60, paddingBottom: 8, paddingTop: 4 },
      tabBarActiveTintColor: "#00d4aa",
      tabBarInactiveTintColor: "#555",
      tabBarLabelStyle: { fontSize: 10, fontWeight: "600", marginTop: -2 },
    }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <Home size={22} color={color} /> }} />
      <Tabs.Screen name="send" options={{ title: "Send", tabBarIcon: ({ color }) => <ArrowUpRight size={22} color={color} /> }} />
      <Tabs.Screen name="history" options={{ title: "History", tabBarIcon: ({ color }) => <Clock size={22} color={color} /> }} />
      <Tabs.Screen name="card" options={{ title: "Card", tabBarIcon: ({ color }) => <CreditCard size={22} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color }) => <User size={22} color={color} /> }} />
    </Tabs>
  );
}
