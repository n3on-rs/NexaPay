import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { useAuth } from "../../src/auth/AuthContext";
import { ChevronRight, LogOut, Shield, Bell, Fingerprint, CircleHelp, Copy, Check, Wallet, Star } from "lucide-react-native";
import { useState } from "react";

export default function ProfileScreen() {
  const { user, address, logout, isBiometricAvailable } = useAuth();
  const [copied, setCopied] = useState(false);

  const copyAddress = () => { setCopied(true); setTimeout(() => setCopied(false), 1500); };

  const menuItems = [
    { icon: Shield, label: "Security & PIN", desc: "Change your transaction PIN", onPress: () => {} },
    { icon: Fingerprint, label: "Biometric Lock", desc: isBiometricAvailable ? "Fingerprint enabled" : "Not available", onPress: () => {} },
    { icon: Bell, label: "Notifications", desc: "Push notifications active", onPress: () => {} },
    { icon: Wallet, label: "Wallet Address", desc: (address || "").slice(0, 12) + "..." + (address || "").slice(-8), onPress: copyAddress, extra: copied ? <Check size={14} color="#00d4aa" /> : <Copy size={14} color="rgba(255,255,255,0.2)" /> },
    { icon: CircleHelp, label: "Help & Documentation", desc: "API docs and support", onPress: () => {} },
  ];

  return (
    <ScrollView style={s.container} contentContainerStyle={s.scroll}>
      <Text style={s.heading}>Profile</Text>

      <View style={s.profileCard}>
        <View style={s.avatarWrap}>
          <View style={s.avatar}><Text style={s.avText}>{user?.fullName?.charAt(0) || "N"}</Text></View>
          {user?.isAgent && <View style={s.agentBadge}><Star size={10} color="#030712" /></View>}
        </View>
        <Text style={s.name}>{user?.fullName || "NexaPay User"}</Text>
        <Text style={s.phone}>{user?.phone || ""}</Text>
        {user?.isAgent && <View style={s.agentPill}><Text style={s.agentPillText}>Verified Agent</Text></View>}
      </View>

      <View style={s.menuCard}>
        {menuItems.map((item, i) => (
          <TouchableOpacity key={item.label} style={[s.menuRow, i === menuItems.length - 1 && { borderBottomWidth: 0 }]} onPress={item.onPress}>
            <View style={s.menuIcon}><item.icon size={18} color="rgba(255,255,255,0.4)" /></View>
            <View style={s.menuInfo}>
              <Text style={s.menuLabel}>{item.label}</Text>
              <Text style={s.menuDesc}>{item.desc}</Text>
            </View>
            {item.extra || <ChevronRight size={14} color="rgba(255,255,255,0.1)" />}
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={s.logout} onPress={() => Alert.alert("Logout", "Are you sure?", [{ text: "Cancel", style: "cancel" }, { text: "Logout", style: "destructive", onPress: logout }])}>
        <LogOut size={16} color="#f87171" /><Text style={s.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      <Text style={s.version}>NexaPay v1.0 · Built by Glitch Inc</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712" },
  scroll: { padding: 24, paddingTop: 70, paddingBottom: 120 },
  heading: { fontSize: 30, fontWeight: "800", color: "#fff", letterSpacing: -0.5, marginBottom: 24 },
  profileCard: { alignItems: "center", backgroundColor: "rgba(12,18,28,0.8)", borderRadius: 24, padding: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", marginBottom: 24 },
  avatarWrap: { position: "relative", marginBottom: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#00d4aa", alignItems: "center", justifyContent: "center" },
  avText: { fontSize: 30, fontWeight: "800", color: "#030712" },
  agentBadge: { position: "absolute", bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: "#fbbf24", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#030712" },
  name: { fontSize: 20, fontWeight: "700", color: "#fff" },
  phone: { fontSize: 14, color: "rgba(255,255,255,0.3)", marginTop: 4 },
  agentPill: { marginTop: 12, backgroundColor: "rgba(0,212,170,0.1)", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "rgba(0,212,170,0.15)" },
  agentPillText: { fontSize: 12, fontWeight: "600", color: "#00d4aa" },
  menuCard: { backgroundColor: "rgba(12,18,28,0.8)", borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", overflow: "hidden" },
  menuRow: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.03)" },
  menuIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.03)", alignItems: "center", justifyContent: "center", marginRight: 14 },
  menuInfo: { flex: 1 },
  menuLabel: { fontSize: 14, fontWeight: "600", color: "#fff" },
  menuDesc: { fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 2 },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 28, backgroundColor: "rgba(248,113,113,0.06)", borderRadius: 20, paddingVertical: 16, borderWidth: 1, borderColor: "rgba(248,113,113,0.08)" },
  logoutText: { color: "#f87171", fontSize: 15, fontWeight: "600" },
  version: { textAlign: "center", color: "rgba(255,255,255,0.1)", fontSize: 11, marginTop: 24 },
});
