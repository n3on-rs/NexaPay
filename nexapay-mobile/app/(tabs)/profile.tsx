import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import { User, Settings, Shield, LogOut, ChevronRight, Bell, CircleHelp, Fingerprint } from "lucide-react-native";

export default function ProfileScreen() {
  const { user, logout, isBiometricAvailable } = useAuth();

  const sections = [
    { icon: User, label: "Personal Info", desc: user?.fullName || "Not set", onPress: () => {} },
    { icon: Shield, label: "Security & PIN", desc: "Change your PIN", onPress: () => {} },
    { icon: Bell, label: "Notifications", desc: "Push enabled", onPress: () => {} },
    { icon: Fingerprint, label: "Biometric Lock", desc: isBiometricAvailable ? "Enabled" : "Not available", onPress: () => {} },
    { icon: CircleHelp, label: "Help & Support", desc: "FAQs and contact", onPress: () => router.push("/docs") },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Profile</Text>

      <View style={styles.profileCard}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{user?.fullName?.charAt(0) || "N"}</Text></View>
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{user?.fullName || "NexaPay User"}</Text>
          <Text style={styles.phone}>{user?.phone || ""}</Text>
          {user?.isAgent && <View style={styles.agentBadge}><Text style={styles.agentText}>Agent</Text></View>}
        </View>
      </View>

      <View style={styles.menuCard}>
        {sections.map((s) => (
          <TouchableOpacity key={s.label} style={styles.menuItem} onPress={s.onPress}>
            <s.icon size={18} color="#888" />
            <View style={styles.menuInfo}>
              <Text style={styles.menuLabel}>{s.label}</Text>
              <Text style={styles.menuDesc}>{s.desc}</Text>
            </View>
            <ChevronRight size={16} color="#333" />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={() => { Alert.alert("Logout", "Are you sure?", [{ text: "Cancel", style: "cancel" }, { text: "Logout", style: "destructive", onPress: logout }]); }}>
        <LogOut size={18} color="#f87171" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0b" },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  heading: { fontSize: 28, fontWeight: "700", color: "#fff", marginBottom: 20 },
  profileCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#111", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", marginBottom: 24 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#00d4aa", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 22, fontWeight: "700", color: "#0b0b0b" },
  profileInfo: { marginLeft: 14, flex: 1 },
  name: { fontSize: 17, fontWeight: "700", color: "#fff" },
  phone: { fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 2 },
  agentBadge: { marginTop: 6, alignSelf: "flex-start", backgroundColor: "rgba(0,212,170,0.15)", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  agentText: { fontSize: 11, fontWeight: "600", color: "#00d4aa" },
  menuCard: { backgroundColor: "#111", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", overflow: "hidden" },
  menuItem: { flexDirection: "row", alignItems: "center", padding: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  menuInfo: { flex: 1, marginLeft: 12 },
  menuLabel: { fontSize: 14, fontWeight: "600", color: "#fff" },
  menuDesc: { fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 32, backgroundColor: "rgba(248,113,113,0.08)", paddingVertical: 14, borderRadius: 14 },
  logoutText: { fontSize: 15, fontWeight: "600", color: "#f87171" },
});
