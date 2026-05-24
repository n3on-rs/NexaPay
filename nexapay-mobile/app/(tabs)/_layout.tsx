import { Tabs } from "expo-router";
import { House, ArrowUpRight, Clock, CreditCard, CircleUser } from "lucide-react-native";

const ACCENT = "#FF6B35";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: {
        backgroundColor: "#0F0F1F",
        borderTopColor: "rgba(255,255,255,0.04)",
        borderTopWidth: 0,
        height: 68,
        paddingBottom: 10,
        paddingTop: 8,
        position: "absolute",
        bottom: 20,
        left: 20,
        right: 20,
        borderRadius: 20,
        elevation: 0,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      tabBarActiveTintColor: ACCENT,
      tabBarInactiveTintColor: "rgba(255,255,255,0.2)",
      tabBarShowLabel: true,
      tabBarLabelStyle: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3, marginTop: -2 },
    }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <House size={21} color={color} /> }} />
      <Tabs.Screen name="send" options={{ title: "Send", tabBarIcon: ({ color }) => <ArrowUpRight size={21} color={color} /> }} />
      <Tabs.Screen name="history" options={{ title: "History", tabBarIcon: ({ color }) => <Clock size={21} color={color} /> }} />
      <Tabs.Screen name="card" options={{ title: "Card", tabBarIcon: ({ color }) => <CreditCard size={21} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color }) => <CircleUser size={21} color={color} /> }} />
    </Tabs>
  );
}
