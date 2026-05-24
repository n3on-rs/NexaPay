import { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useAuth } from "../../src/auth/AuthContext";
import { api } from "../../src/api/client";
import { Eye, EyeOff, Copy, Shield } from "lucide-react-native";
import type { AccountDetails } from "../../src/types";

export default function CardScreen() {
  const { token, address, user } = useAuth();
  const [account, setAccount] = useState<AccountDetails | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !address) return;
    api.get<any>(`/accounts/${address}`, { "X-Account-Token": token }).then(res => {
      if (res.ok) setAccount(res.data as AccountDetails);
      setLoading(false);
    });
  }, [token, address]);

  if (loading) return <View style={styles.container}><ActivityIndicator color="#00d4aa" style={{ marginTop: 100 }} /></View>;

  const card = account?.card;
  const frozen = account?.card_frozen;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Virtual Card</Text>
      <Text style={styles.sub}>Your NexaPay Visa debit card</Text>

      <TouchableOpacity onPress={() => setFlipped(!flipped)} activeOpacity={0.95} style={styles.cardOuter}>
        <View style={[styles.card, flipped && styles.cardFlipped]}>
          <View style={styles.cardGlow} />
          {!flipped ? (
            <>
              <View style={styles.cardTop}>
                <Text style={styles.cardBrand}>NexaPay</Text>
                <Text style={styles.cardType}>{card?.type || "VISA"}</Text>
              </View>
              <View style={styles.chip} />
              <Text style={styles.cardNumber}>•••• •••• •••• {card?.last4 || "----"}</Text>
              <View style={styles.cardBottom}>
                <View>
                  <Text style={styles.cardLabel}>CARD HOLDER</Text>
                  <Text style={styles.cardValue}>{user?.fullName || "NexaPay User"}</Text>
                </View>
                <View>
                  <Text style={styles.cardLabel}>EXPIRES</Text>
                  <Text style={styles.cardValue}>{card?.expiry || "--/--"}</Text>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.cardBack}>
              <View style={styles.magneticStripe} />
              <View style={styles.cvvRow}>
                <Text style={styles.cvvLabel}>CVV</Text>
                <View style={styles.cvvBox}><Text style={styles.cvvText}>***</Text></View>
              </View>
              <Text style={styles.cardDisclaimer}>This is a virtual debit card for online use only. Protected by NexaPay.</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.flipBtn} onPress={() => setFlipped(!flipped)}>
        {flipped ? <Eye size={16} color="#888" /> : <EyeOff size={16} color="#888" />}
        <Text style={styles.flipText}>{flipped ? "Show front" : "Show back"}</Text>
      </TouchableOpacity>

      {frozen && (
        <View style={styles.frozenBanner}>
          <Shield size={16} color="#f87171" /><Text style={styles.frozenText}>Card is frozen</Text>
        </View>
      )}

      {/* Card details */}
      <View style={styles.details}>
        {[["Card Number", `•••• •••• •••• ${card?.last4 || "----"}`], ["Expiry", card?.expiry || "--/--"], ["Type", card?.type || "VISA"], ["Status", frozen ? "Frozen" : "Active"]].map(([k, v]) => (
          <View key={k} style={styles.detailRow}>
            <Text style={styles.detailKey}>{k}</Text>
            <Text style={styles.detailVal}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0b", paddingHorizontal: 20, paddingTop: 60 },
  heading: { fontSize: 28, fontWeight: "700", color: "#fff", marginBottom: 4 },
  sub: { fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 24 },
  cardOuter: { marginBottom: 20 },
  card: { borderRadius: 20, padding: 24, backgroundColor: "#111", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", height: 220, justifyContent: "space-between", overflow: "hidden" },
  cardFlipped: { backgroundColor: "#181818" },
  cardGlow: { position: "absolute", top: -30, right: -30, width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(0,212,170,0.04)" },
  cardTop: { flexDirection: "row", justifyContent: "space-between" },
  cardBrand: { fontSize: 14, fontWeight: "700", color: "#fff", letterSpacing: 1 },
  cardType: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.4)", letterSpacing: 2 },
  chip: { width: 36, height: 28, borderRadius: 4, backgroundColor: "#c8a84b", marginTop: 8 },
  cardNumber: { fontSize: 18, fontWeight: "600", color: "rgba(255,255,255,0.8)", letterSpacing: 3, fontFamily: "monospace" },
  cardBottom: { flexDirection: "row", justifyContent: "space-between" },
  cardLabel: { fontSize: 9, fontWeight: "700", color: "rgba(255,255,255,0.3)", letterSpacing: 1, marginBottom: 2 },
  cardValue: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.7)" },
  cardBack: { flex: 1, justifyContent: "flex-start" },
  magneticStripe: { height: 40, backgroundColor: "#222", marginHorizontal: -24, marginTop: 16 },
  cvvRow: { flexDirection: "row", alignItems: "center", marginTop: 24 },
  cvvLabel: { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.3)", letterSpacing: 1, marginRight: 12 },
  cvvBox: { backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 6, borderRadius: 4 },
  cvvText: { fontSize: 14, fontWeight: "700", color: "#111", fontFamily: "monospace" },
  cardDisclaimer: { fontSize: 9, color: "rgba(255,255,255,0.2)", marginTop: 32 },
  flipBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 20 },
  flipText: { fontSize: 13, color: "#888" },
  frozenBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(248,113,113,0.1)", padding: 12, borderRadius: 12, marginBottom: 20 },
  frozenText: { color: "#f87171", fontSize: 13, fontWeight: "600" },
  details: { backgroundColor: "#111", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  detailKey: { fontSize: 13, color: "rgba(255,255,255,0.4)" },
  detailVal: { fontSize: 13, fontWeight: "600", color: "#fff" },
});
