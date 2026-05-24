import { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Dimensions } from "react-native";
import { useAuth } from "../../src/auth/AuthContext";
import { api } from "../../src/api/client";
import { Eye, Shield, Wifi } from "lucide-react-native";
import type { AccountDetails } from "../../src/types";
import { LinearGradient } from "expo-linear-gradient";

const { width: W } = Dimensions.get("window");

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

  const frontInterpolate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const backInterpolate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });

  if (loading) return <View style={s.container}><ActivityIndicator color="#00d4aa" style={{ marginTop: 120 }} /></View>;

  const card = account?.card;

  return (
    <View style={s.container}>
      <Text style={s.heading}>Virtual Card</Text>
      <Text style={s.sub}>Your NexaPay Visa debit card</Text>

      {/* Card */}
      <View style={s.cardWrap}>
        {/* Front */}
        <Animated.View style={[s.cardFace, { transform: [{ rotateY: frontInterpolate }], zIndex: flipped ? 0 : 1 }]}>
          <LinearGradient colors={["#1a1a2e", "#16213e", "#0f3460"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cardGrad}>
            <View style={s.cardTop}>
              <View>
                <Text style={s.cardBrand}>NEXAPAY</Text>
                <Text style={s.cardType}>PLATINUM</Text>
              </View>
              <Wifi size={20} color="rgba(255,255,255,0.6)" style={{ transform: [{ rotate: "90deg" }] }} />
            </View>
            <View style={s.chip}>
              <View style={s.chipInner} />
            </View>
            <Text style={s.cardNum}>••••  ••••  ••••  {card?.last4 || "----"}</Text>
            <View style={s.cardBot}>
              <View>
                <Text style={s.cardLbl}>CARDHOLDER</Text>
                <Text style={s.cardVal}>{(user?.fullName || "NEXAPAY USER").toUpperCase()}</Text>
              </View>
              <View>
                <Text style={s.cardLbl}>EXPIRES</Text>
                <Text style={s.cardVal}>{card?.expiry || "--/--"}</Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Back */}
        <Animated.View style={[s.cardFace, s.cardBack, { transform: [{ rotateY: backInterpolate }], zIndex: flipped ? 1 : 0 }]}>
          <LinearGradient colors={["#16213e", "#0f3460", "#1a1a2e"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cardGrad}>
            <View style={s.magStripe} />
            <View style={s.cvvSec}>
              <Text style={s.cvvLbl}>CVV</Text>
              <View style={s.cvvBox}><Text style={s.cvvVal}>***</Text></View>
            </View>
            <Text style={s.cardDisc}>This virtual card is issued by NexaPay for online transactions only. Protected by AES-256-GCM encryption.</Text>
          </LinearGradient>
        </Animated.View>
      </View>

      <TouchableOpacity style={s.flipBtn} onPress={toggleFlip}>
        <Eye size={16} color="rgba(255,255,255,0.4)" />
        <Text style={s.flipText}>{flipped ? "Show front" : "Show details"}</Text>
      </TouchableOpacity>

      {account?.card_frozen && (
        <View style={s.frozen}><Shield size={14} color="#f87171" /><Text style={s.frozenText}>Card is frozen</Text></View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712", paddingHorizontal: 24, paddingTop: 70 },
  heading: { fontSize: 30, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  sub: { fontSize: 14, color: "rgba(255,255,255,0.3)", marginBottom: 28 },
  cardWrap: { height: 220, marginBottom: 20 },
  cardFace: { position: "absolute", width: "100%", height: "100%", backfaceVisibility: "hidden", borderRadius: 20, overflow: "hidden" },
  cardBack: {},
  cardGrad: { flex: 1, borderRadius: 20, padding: 24, justifyContent: "space-between" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardBrand: { fontSize: 16, fontWeight: "800", color: "#fff", letterSpacing: 2 },
  cardType: { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.4)", letterSpacing: 3, marginTop: 2 },
  chip: { marginTop: 4 },
  chipInner: { width: 40, height: 30, borderRadius: 6, backgroundColor: "rgba(200,168,75,0.8)" },
  cardNum: { fontSize: 18, fontWeight: "600", color: "rgba(255,255,255,0.85)", letterSpacing: 4, fontFamily: "monospace" },
  cardBot: { flexDirection: "row", justifyContent: "space-between" },
  cardLbl: { fontSize: 8, fontWeight: "700", color: "rgba(255,255,255,0.3)", letterSpacing: 1, marginBottom: 2 },
  cardVal: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.7)", letterSpacing: 0.5 },
  magStripe: { height: 40, backgroundColor: "rgba(0,0,0,0.6)", marginHorizontal: -24, marginTop: 10 },
  cvvSec: { flexDirection: "row", alignItems: "center", marginTop: 20 },
  cvvLbl: { fontSize: 9, fontWeight: "700", color: "rgba(255,255,255,0.3)", letterSpacing: 1, marginRight: 12 },
  cvvBox: { backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 6, borderRadius: 4 },
  cvvVal: { fontSize: 14, fontWeight: "700", color: "#111", fontFamily: "monospace" },
  cardDisc: { fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 20 },
  flipBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 20 },
  flipText: { fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: "500" },
  frozen: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(248,113,113,0.06)", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "rgba(248,113,113,0.1)" },
  frozenText: { color: "#f87171", fontSize: 13, fontWeight: "600" },
});
