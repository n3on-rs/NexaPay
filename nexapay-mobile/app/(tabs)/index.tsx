import { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Dimensions, Animated, ImageBackground } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import { api } from "../../src/api/client";
import { ArrowUpRight, ArrowDownLeft, Send, QrCode, CreditCard, TrendingUp, ChevronRight, Sparkles, Zap, History, Scan } from "lucide-react-native";
import type { AccountDetails, TransactionView } from "../../src/types";

const { width: W } = Dimensions.get("window");

function Orb({ size, top, left, color, opacity }: any) {
  return (
    <View style={{ position: "absolute", top, left, width: size, height: size, borderRadius: size/2, backgroundColor: color, opacity, transform: [{ scale: 1.5 }] }} />
  );
}

export default function HomeScreen() {
  const { user, token, address } = useAuth();
  const [account, setAccount] = useState<AccountDetails | null>(null);
  const [recentTx, setRecentTx] = useState<TransactionView[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const loadData = useCallback(async () => {
    if (!token || !address) return;
    const [accRes, txRes] = await Promise.all([
      api.get<any>(`/accounts/${address}`, { "X-Account-Token": token }),
      api.get<any>(`/accounts/${address}/transactions`, { "X-Account-Token": token }),
    ]);
    if (accRes.ok) setAccount(accRes.data as AccountDetails);
    if (txRes.ok && txRes.data.transactions) setRecentTx((txRes.data.transactions as TransactionView[]).slice(0, 6));
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, [token, address]);

  useEffect(() => { loadData(); pulse(); }, [loadData]);

  const pulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  };

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const balance = account?.balance || 0;
  const tndBalance = (balance / 1000).toFixed(3);
  const [whole, decimal] = tndBalance.split(".");

  const quickActions = [
    { icon: Send, label: "Send", gradient: ["#00d4aa", "#00b894"], onPress: () => router.push("/send") },
    { icon: QrCode, label: "Receive", gradient: ["#6366f1", "#818cf8"], onPress: () => {} },
    { icon: Scan, label: "Scan", gradient: ["#f59e0b", "#fbbf24"], onPress: () => {} },
    { icon: CreditCard, label: "Card", gradient: ["#ec4899", "#f472b6"], onPress: () => router.push("/card") },
  ];

  return (
    <View style={s.container}>
      {/* Background orbs */}
      <Orb size={300} top={-100} left={-100} color="#00d4aa" opacity={0.04} />
      <Orb size={250} top={200} left={W - 150} color="#6366f1" opacity={0.04} />
      <Orb size={200} top={500} left={50} color="#ec4899" opacity={0.03} />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00d4aa" colors={["#00d4aa"]} progressViewOffset={80} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
      >
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.greeting}>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}</Text>
            <Text style={s.name}>{user?.fullName?.split(" ")[0] || "there"} <Sparkles size={16} color="#fbbf24" /></Text>
          </View>
          <TouchableOpacity style={s.avatarRing}>
            <View style={s.avatar}><Text style={s.avatarText}>{user?.fullName?.charAt(0) || "N"}</Text></View>
          </TouchableOpacity>
        </View>

        {/* Balance Orb */}
        <Animated.View style={[s.balanceOrb, { transform: [{ scale: pulseAnim }] }]}>
          <View style={s.balanceGlow} />
          <Text style={s.balanceLabel}>TOTAL BALANCE</Text>
          <View style={s.balanceRow}>
            <Text style={s.balanceWhole}>{whole}</Text>
            <Text style={s.balanceDecimal}>.{decimal} <Text style={s.balanceCurrency}>TND</Text></Text>
          </View>
          <View style={s.addrPill}>
            <Text style={s.addrText}>{(address || "").slice(0, 8)}...{(address || "").slice(-6)}</Text>
          </View>
        </Animated.View>

        {/* Quick Actions */}
        <View style={s.actions}>
          {quickActions.map((a, i) => (
            <TouchableOpacity key={a.label} style={s.actionBtn} onPress={a.onPress} activeOpacity={0.7}>
              <View style={[s.actionIconWrap, { backgroundColor: `${a.gradient[0]}20` }]}>
                <a.icon size={22} color={a.gradient[0]} />
              </View>
              <Text style={s.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Activity */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Recent Activity</Text>
            <TouchableOpacity onPress={() => router.push("/history")} style={s.seeAll}>
              <Text style={s.seeAllText}>History</Text><ChevronRight size={14} color="#00d4aa" />
            </TouchableOpacity>
          </View>

          <Animated.View style={{ opacity: fadeAnim }}>
            {recentTx.length === 0 ? (
              <View style={s.emptyState}>
                <View style={s.emptyIcon}><Zap size={24} color="#333" /></View>
                <Text style={s.emptyTitle}>No activity yet</Text>
                <Text style={s.emptySub}>Your transactions will appear here</Text>
              </View>
            ) : (
              <View style={s.txList}>
                {recentTx.map((tx, i) => (
                  <View key={tx.id} style={[s.txItem, i === recentTx.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={[s.txDot, { backgroundColor: tx.direction === "credit" ? "#00d4aa" : "#f87171" }]}>
                      {tx.direction === "credit" ? <ArrowDownLeft size={12} color="#fff" /> : <ArrowUpRight size={12} color="#fff" />}
                    </View>
                    <View style={s.txInfo}>
                      <Text style={s.txTitle} numberOfLines={1}>{tx.memo || tx.from_name || tx.to_name || "Transfer"}</Text>
                      <Text style={s.txTime}>{new Date(tx.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {tx.timestamp.slice(11, 16)}</Text>
                    </View>
                    <View style={s.txRight}>
                      <Text style={[s.txAmt, { color: tx.direction === "credit" ? "#00d4aa" : "#f87171" }]}>{tx.direction === "credit" ? "+" : "−"}{tx.amount_display}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712" },
  scroll: { paddingBottom: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, paddingTop: 70, paddingBottom: 20 },
  greeting: { fontSize: 13, color: "rgba(255,255,255,0.35)", fontWeight: "500", letterSpacing: 0.5 },
  name: { fontSize: 25, fontWeight: "800", color: "#fff", marginTop: 2, letterSpacing: -0.3 },
  avatarRing: { padding: 2, borderRadius: 30, borderWidth: 1.5, borderColor: "rgba(0,212,170,0.3)" },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#00d4aa", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontWeight: "800", color: "#030712" },
  balanceOrb: { marginHorizontal: 24, backgroundColor: "rgba(12,18,28,0.9)", borderRadius: 32, padding: 28, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", overflow: "hidden" },
  balanceGlow: { position: "absolute", top: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: "rgba(0,212,170,0.06)", transform: [{ scale: 1.5 }] },
  balanceLabel: { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.3)", letterSpacing: 3, marginBottom: 12 },
  balanceRow: { flexDirection: "row", alignItems: "flex-end" },
  balanceWhole: { fontSize: 52, fontWeight: "900", color: "#fff", letterSpacing: -2, lineHeight: 56 },
  balanceDecimal: { fontSize: 22, fontWeight: "600", color: "rgba(255,255,255,0.5)", paddingBottom: 6 },
  balanceCurrency: { fontSize: 14, fontWeight: "600", color: "rgba(255,255,255,0.25)" },
  addrPill: { marginTop: 16, backgroundColor: "rgba(255,255,255,0.04)", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.04)" },
  addrText: { fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "monospace", letterSpacing: 0.5 },
  actions: { flexDirection: "row", justifyContent: "space-around", paddingHorizontal: 24, marginTop: 28, marginBottom: 8 },
  actionBtn: { alignItems: "center", gap: 10 },
  actionIconWrap: { width: 56, height: 56, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.5)", letterSpacing: 0.3 },
  section: { marginTop: 28, paddingHorizontal: 24 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#fff", letterSpacing: -0.2 },
  seeAll: { flexDirection: "row", alignItems: "center" },
  seeAllText: { fontSize: 13, color: "#00d4aa", fontWeight: "600" },
  emptyState: { alignItems: "center", paddingVertical: 48, backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.04)", borderStyle: "dashed" },
  emptyIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.03)", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: "rgba(255,255,255,0.2)" },
  emptySub: { fontSize: 12, color: "rgba(255,255,255,0.1)", marginTop: 4 },
  txList: { backgroundColor: "rgba(12,18,28,0.6)", borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.04)", overflow: "hidden" },
  txItem: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.03)" },
  txDot: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  txInfo: { flex: 1, marginLeft: 14 },
  txTitle: { fontSize: 14, fontWeight: "600", color: "#fff" },
  txTime: { fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 3, letterSpacing: 0.2 },
  txRight: { alignItems: "flex-end" },
  txAmt: { fontSize: 14, fontWeight: "700", letterSpacing: -0.2 },
});
