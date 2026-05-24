import { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Dimensions, Animated as RNAnimated, PanResponder } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import { api } from "../../src/api/client";
import { ArrowUpRight, ArrowDownLeft, Wallet, CreditCard, QrCode, History, TrendingUp, ChevronRight, Bell, Fingerprint } from "lucide-react-native";
import type { AccountDetails, TransactionView } from "../../src/types";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function HomeScreen() {
  const { user, token, address, isBiometricAvailable, authenticateWithBiometrics } = useAuth();
  const [account, setAccount] = useState<AccountDetails | null>(null);
  const [recentTx, setRecentTx] = useState<TransactionView[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [fingerprintTriggered, setFingerprintTriggered] = useState(false);

  const loadData = useCallback(async () => {
    if (!token || !address) return;
    const [accRes, txRes] = await Promise.all([
      api.get<any>(`/accounts/${address}`, { "X-Account-Token": token }),
      api.get<any>(`/accounts/${address}/transactions`, { "X-Account-Token": token }),
    ]);
    if (accRes.ok) setAccount(accRes.data as AccountDetails);
    if (txRes.ok && txRes.data.transactions) setRecentTx((txRes.data.transactions as TransactionView[]).slice(0, 5));
  }, [token, address]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const handleBiometricGate = async () => {
    if (fingerprintTriggered || !isBiometricAvailable) return;
    setFingerprintTriggered(true);
    const ok = await authenticateWithBiometrics();
    if (!ok) router.replace("/login");
  };

  useEffect(() => { if (user) handleBiometricGate(); }, [user]);

  const balance = account?.balance || 0;
  const displayBalance = account?.balance_display || "0.000 TND";

  const quickActions = [
    { icon: ArrowUpRight, label: "Send", color: "#00d4aa", onPress: () => router.push("/send") },
    { icon: QrCode, label: "Receive", color: "#60a5fa", onPress: () => {} },
    { icon: CreditCard, label: "Card", color: "#a78bfa", onPress: () => router.push("/card") },
    { icon: Wallet, label: "Fund", color: "#fbbf24", onPress: () => {} },
  ];

  return (
    <View style={styles.container}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00d4aa" colors={["#00d4aa"]} />} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hello{user?.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}</Text>
            <Text style={styles.headerSub}>Your NexaPay wallet</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.iconBtn}><Bell size={20} color="#888" /></TouchableOpacity>
            <TouchableOpacity style={styles.avatar}><Text style={styles.avatarText}>{user?.fullName?.charAt(0) || "N"}</Text></TouchableOpacity>
          </View>
        </View>

        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceGlow} />
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>{displayBalance}</Text>
          <View style={styles.balanceRow}>
            <View style={styles.balanceAddr}><Text style={styles.balanceAddrText}>{(address || "").slice(0, 16)}...</Text></View>
            <View style={styles.verifiedBadge}><Text style={styles.verifiedText}>Verified</Text></View>
          </View>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            {quickActions.map((a) => (
              <TouchableOpacity key={a.label} style={styles.quickBtn} onPress={a.onPress}>
                <View style={[styles.quickIcon, { backgroundColor: `${a.color}15` }]}><a.icon size={20} color={a.color} /></View>
                <Text style={styles.quickLabel}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Recent Transactions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            <TouchableOpacity onPress={() => router.push("/history")} style={styles.seeAll}>
              <Text style={styles.seeAllText}>See all</Text><ChevronRight size={14} color="#00d4aa" />
            </TouchableOpacity>
          </View>

          {recentTx.length === 0 ? (
            <View style={styles.empty}>
              <History size={32} color="#333" />
              <Text style={styles.emptyText}>No transactions yet</Text>
            </View>
          ) : (
            recentTx.map((tx) => (
              <TouchableOpacity key={tx.id} style={styles.txRow}>
                <View style={[styles.txIcon, { backgroundColor: tx.direction === "credit" ? "rgba(0,212,170,0.1)" : "rgba(248,113,113,0.1)" }]}>
                  {tx.direction === "credit" ? <ArrowDownLeft size={16} color="#00d4aa" /> : <ArrowUpRight size={16} color="#f87171" />}
                </View>
                <View style={styles.txInfo}>
                  <Text style={styles.txName} numberOfLines={1}>{tx.memo || (tx.direction === "credit" ? tx.from_name : tx.to_name) || "Transfer"}</Text>
                  <Text style={styles.txMeta}>{tx.direction === "credit" ? "Received" : "Sent"} · {new Date(tx.timestamp).toLocaleDateString()}</Text>
                </View>
                <Text style={[styles.txAmount, { color: tx.direction === "credit" ? "#00d4aa" : "#f87171" }]}>
                  {tx.direction === "credit" ? "+" : "-"}{tx.amount_display}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Fingerprint prompt */}
        {isBiometricAvailable && !fingerprintTriggered && (
          <TouchableOpacity style={styles.fingerprintBtn} onPress={handleBiometricGate}>
            <Fingerprint size={28} color="#00d4aa" />
            <Text style={styles.fingerprintText}>Unlock with fingerprint</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0b" },
  scrollContent: { paddingBottom: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20 },
  greeting: { fontSize: 24, fontWeight: "700", color: "#fff" },
  headerSub: { fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 2 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center" },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#00d4aa", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontWeight: "700", color: "#0b0b0b" },
  balanceCard: { marginHorizontal: 20, backgroundColor: "#111", borderRadius: 24, padding: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", overflow: "hidden" },
  balanceGlow: { position: "absolute", top: -40, right: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(0,212,170,0.06)" },
  balanceLabel: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 },
  balanceAmount: { fontSize: 36, fontWeight: "800", color: "#fff", marginTop: 4, letterSpacing: -0.5 },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  balanceAddr: { backgroundColor: "rgba(255,255,255,0.04)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  balanceAddrText: { fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" },
  verifiedBadge: { backgroundColor: "rgba(0,212,170,0.1)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  verifiedText: { fontSize: 11, color: "#00d4aa", fontWeight: "600" },
  quickActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  quickBtn: { alignItems: "center", gap: 8 },
  quickIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: "500" },
  section: { marginTop: 28, paddingHorizontal: 20 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#fff" },
  seeAll: { flexDirection: "row", alignItems: "center" },
  seeAllText: { fontSize: 13, color: "#00d4aa", fontWeight: "600" },
  empty: { alignItems: "center", paddingVertical: 40 },
  emptyText: { color: "#555", fontSize: 13, marginTop: 8 },
  txRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  txIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  txInfo: { flex: 1, marginLeft: 12 },
  txName: { fontSize: 14, fontWeight: "600", color: "#fff" },
  txMeta: { fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: "700" },
  fingerprintBtn: { marginTop: 24, marginHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "rgba(0,212,170,0.06)", paddingVertical: 16, borderRadius: 16 },
  fingerprintText: { color: "#00d4aa", fontSize: 14, fontWeight: "600" },
});
