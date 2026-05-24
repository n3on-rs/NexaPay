import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { useAuth } from "../../src/auth/AuthContext";
import { ChevronRight, LogOut, Shield, Bell, Fingerprint, CircleHelp, Wallet, Star } from "lucide-react-native";

const ACCENT = "#FF6B35";
const BG = "#0A0A14";
const SURFACE = "rgba(255,255,255,0.03)";

export default function ProfileScreen() {
  const { user, address, logout, isBiometricAvailable } = useAuth();

  const items = [
    { icon: Shield, label: "Security & PIN", desc: "Change your transaction PIN" },
    { icon: Fingerprint, label: "Biometric Lock", desc: isBiometricAvailable ? "Fingerprint enabled" : "Not available" },
    { icon: Bell, label: "Notifications", desc: "Push enabled" },
    { icon: Wallet, label: "Wallet Address", desc: (address||"").slice(0,12)+"..."+(address||"").slice(-8) },
    { icon: CircleHelp, label: "Help & Docs", desc: "API reference and support" },
  ];

  return (
    <ScrollView style={s.container} contentContainerStyle={s.scroll}>
      <Text style={s.heading}>Profile</Text>

      <View style={s.card}>
        <View style={s.avWrap}>
          <View style={s.av}><Text style={s.avText}>{user?.fullName?.charAt(0)||"N"}</Text></View>
          {user?.isAgent && <View style={s.agentBadge}><Star size={8} color="#fff" /></View>}
        </View>
        <Text style={s.name}>{user?.fullName||"NexaPay User"}</Text>
        <Text style={s.phone}>{user?.phone||""}</Text>
      </View>

      <View style={s.menu}>
        {items.map((it, i) => (
          <TouchableOpacity key={it.label} style={[s.row, i===items.length-1 && { borderBottomWidth: 0 }]}>
            <View style={s.rowIcon}><it.icon size={17} color="rgba(255,255,255,0.4)" /></View>
            <View style={s.rowInfo}>
              <Text style={s.rowLabel}>{it.label}</Text>
              <Text style={s.rowDesc}>{it.desc}</Text>
            </View>
            <ChevronRight size={14} color="rgba(255,255,255,0.1)" />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={s.logout} onPress={() => Alert.alert("Logout", "Are you sure?", [{text:"Cancel",style:"cancel"},{text:"Logout",style:"destructive",onPress:logout}])}>
        <LogOut size={16} color="#ff5050" /><Text style={s.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      <Text style={s.ver}>NexaPay v1.0 · Glitch Inc</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { padding: 24, paddingTop: 70, paddingBottom: 120 },
  heading: { fontSize: 36, fontWeight: "900", color: "#fff", letterSpacing: -1, marginBottom: 24 },
  card: { alignItems: "center", backgroundColor: SURFACE, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", marginBottom: 24 },
  avWrap: { position: "relative", marginBottom: 16 },
  av: { width: 64, height: 64, borderRadius: 18, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center" },
  avText: { fontSize: 26, fontWeight: "800", color: "#fff" },
  agentBadge: { position: "absolute", bottom: 0, right: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: "#000", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: BG },
  name: { fontSize: 18, fontWeight: "700", color: "#fff" },
  phone: { fontSize: 13, color: "rgba(255,255,255,0.3)", marginTop: 4 },
  menu: { backgroundColor: SURFACE, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  rowIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.03)", alignItems: "center", justifyContent: "center", marginRight: 14 },
  rowInfo: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: "600", color: "#fff" },
  rowDesc: { fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 2 },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 28, backgroundColor: "rgba(255,80,80,0.06)", borderRadius: 18, paddingVertical: 16, borderWidth: 1, borderColor: "rgba(255,80,80,0.08)" },
  logoutText: { color: "#ff5050", fontSize: 15, fontWeight: "600" },
  ver: { textAlign: "center", color: "rgba(255,255,255,0.08)", fontSize: 11, marginTop: 24 },
});
