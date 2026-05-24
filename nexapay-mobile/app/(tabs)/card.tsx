import { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Dimensions } from "react-native";
import { useAuth } from "../../src/auth/AuthContext";
import { api } from "../../src/api/client";
import { Shield } from "lucide-react-native";
import type { AccountDetails } from "../../src/types";

const { width: W } = Dimensions.get("window");
const ACCENT = "#FF6B35";
const BG = "#0A0A14";

export default function CardScreen() {
  const { token, address, user } = useAuth();
  const [account, setAccount] = useState<AccountDetails | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const flipAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!token || !address) return;
    api.get<any>(`/accounts/${address}`, { "X-Account-Token": token }).then(res => {
      if (res.ok) setAccount(res.data as AccountDetails);
      setLoading(false);
    });
  }, [token, address]);

  const toggleFlip = () => {
    Animated.spring(flipAnim, { toValue: flipped ? 0 : 1, friction: 6, tension: 40, useNativeDriver: true }).start();
    setFlipped(!flipped);
  };

  const frontDeg = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const backDeg = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });

  if (loading) return <View style={s.container}><ActivityIndicator color={ACCENT} style={{ marginTop: 120 }} /></View>;
  const card = account?.card;

  return (
    <View style={s.container}>
      <Text style={s.heading}>Virtual{'\n'}Card</Text>

      <View style={s.cardWrap}>
        <Animated.View style={[s.face, { transform: [{ rotateY: frontDeg }], zIndex: flipped ? 0 : 1 }]}>
          <View style={s.cardFront}>
            <View style={s.cardTop}>
              <View><Text style={s.brand}>NEXAPAY</Text><Text style={s.type}>DEBIT</Text></View>
              <View style={s.chip}>
                <View style={s.chipInner} />
                <View style={[s.chipInner, { marginTop: 2, width: 20 }]} />
              </View>
            </View>
            <Text style={s.cardNum}>••••  ••••  ••••  {card?.last4||"----"}</Text>
            <View style={s.cardBot}>
              <View><Text style={s.lbl}>HOLDER</Text><Text style={s.val}>{(user?.fullName||"NEXAPAY USER").toUpperCase()}</Text></View>
              <View><Text style={s.lbl}>EXP</Text><Text style={s.val}>{card?.expiry||"--/--"}</Text></View>
            </View>
          </View>
        </Animated.View>

        <Animated.View style={[s.face, s.back, { transform: [{ rotateY: backDeg }], zIndex: flipped ? 1 : 0 }]}>
          <View style={s.cardFront}>
            <View style={s.stripe} />
            <View style={s.cvvRow}><Text style={s.lbl}>CVV</Text><View style={s.cvv}><Text style={s.cvvText}>***</Text></View></View>
            <Text style={s.disc}>Protected by NexaPay · AES-256-GCM</Text>
          </View>
        </Animated.View>
      </View>

      <TouchableOpacity style={s.flipBtn} onPress={toggleFlip}>
        <Text style={s.flipText}>{flipped ? "Show front" : "Show back"}</Text>
      </TouchableOpacity>

      {account?.card_frozen && (
        <View style={s.frozen}><Shield size={14} color="#ff5050" /><Text style={s.frozenText}>Card is frozen</Text></View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, paddingHorizontal: 24, paddingTop: 70 },
  heading: { fontSize: 36, fontWeight: "900", color: "#fff", letterSpacing: -1, lineHeight: 40, marginBottom: 24 },
  cardWrap: { height: 220, marginBottom: 20 },
  face: { position: "absolute", width: "100%", height: "100%", backfaceVisibility: "hidden" },
  back: {},
  cardFront: { flex: 1, borderRadius: 20, padding: 24, justifyContent: "space-between", backgroundColor: "#1A1A2E", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  cardTop: { flexDirection: "row", justifyContent: "space-between" },
  brand: { fontSize: 16, fontWeight: "800", color: "#fff", letterSpacing: 2 },
  type: { fontSize: 9, fontWeight: "700", color: "rgba(255,255,255,0.3)", letterSpacing: 2, marginTop: 2 },
  chip: { flexDirection: "row", gap: 4 },
  chipInner: { width: 30, height: 20, borderRadius: 3, backgroundColor: "rgba(255,107,53,0.6)" },
  cardNum: { fontSize: 20, fontWeight: "600", color: "rgba(255,255,255,0.85)", letterSpacing: 4, fontFamily: "monospace" },
  cardBot: { flexDirection: "row", justifyContent: "space-between" },
  lbl: { fontSize: 8, fontWeight: "700", color: "rgba(255,255,255,0.25)", letterSpacing: 1, marginBottom: 2 },
  val: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.7)", letterSpacing: 0.3 },
  stripe: { height: 40, backgroundColor: "rgba(0,0,0,0.4)", marginHorizontal: -24, marginTop: 8 },
  cvvRow: { flexDirection: "row", alignItems: "center", marginTop: 20, gap: 12 },
  cvv: { backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 5, borderRadius: 3 },
  cvvText: { fontSize: 14, fontWeight: "700", color: "#111", fontFamily: "monospace" },
  disc: { fontSize: 8, color: "rgba(255,255,255,0.15)", marginTop: 24 },
  flipBtn: { alignItems: "center", padding: 12 },
  flipText: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.3)" },
  frozen: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(255,80,80,0.06)", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(255,80,80,0.08)" },
  frozenText: { color: "#ff5050", fontSize: 13, fontWeight: "600" },
});
