import { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Dimensions, Animated, Pressable } from "react-native";
import Svg, { Circle, Path, Defs, LinearGradient as SvgGrad, Stop, G, Rect } from "react-native-svg";
import { router } from "expo-router";
import { useAuth } from "../../src/auth/AuthContext";
import { api } from "../../src/api/client";
import { ArrowUpRight, ArrowDownLeft, Plus, Minus, TrendingUp } from "lucide-react-native";
import type { AccountDetails, TransactionView } from "../../src/types";

const { width: W, height: H } = Dimensions.get("window");
const ACCENT = "#FF6B35"; // warm amber-orange
const BG = "#0A0A14";
const SURFACE = "#141428";
const MUTED = "rgba(255,255,255,0.35)";

// ─── Animated ring component ───
function BalanceRing({ balance, size = 200 }: { balance: number; size?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const strokeW = 5;
  const radius = (size - strokeW) / 2;
  const circumference = 2 * Math.PI * radius;
  const maxBalance = 500000;
  const progress = Math.min(balance / maxBalance, 1);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 10000, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 10000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const orbit1Deg = anim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const orbit2Deg = anim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-360deg"] });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {/* Decorative dots orbiting */}
      <Animated.View style={{ position: "absolute", transform: [{ rotate: orbit1Deg }] }}>
        <View style={{ width: size - 16, height: size - 16, alignItems: "center", justifyContent: "flex-start" }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT, opacity: 0.7 }} />
        </View>
      </Animated.View>
      <Animated.View style={{ position: "absolute", transform: [{ rotate: orbit2Deg }] }}>
        <View style={{ width: size - 28, height: size - 28, alignItems: "center", justifyContent: "flex-start" }}>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(255,107,53,0.5)", marginTop: 24 }} />
        </View>
      </Animated.View>

      {/* Ring — static progress arc */}
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <SvgGrad id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={ACCENT} stopOpacity="1" />
            <Stop offset="1" stopColor="#FF8F65" stopOpacity="1" />
          </SvgGrad>
        </Defs>
        <Circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={strokeW} />
        <Circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="url(#ringGrad)" strokeWidth={strokeW} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

export default function HomeScreen() {
  const { user, token, address } = useAuth();
  const [account, setAccount] = useState<AccountDetails | null>(null);
  const [transactions, setTransactions] = useState<TransactionView[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const ringAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    if (!token || !address) return;
    const [a, t] = await Promise.all([
      api.get<any>(`/accounts/${address}`, { "X-Account-Token": token }),
      api.get<any>(`/accounts/${address}/transactions`, { "X-Account-Token": token }),
    ]);
    if (a.ok) setAccount(a.data as AccountDetails);
    if (t.ok) setTransactions((t.data.transactions || []).slice(0, 8));
    Animated.spring(ringAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  }, [token, address]);

  useEffect(() => { load(); }, [load]);

  const balance = account?.balance || 0;
  const tnd = (balance / 1000).toFixed(3);
  const [whole, frac] = tnd.split(".");

  // Group transactions by date
  const today = new Date().toDateString();
  const todayTx = transactions.filter(t => new Date(t.timestamp).toDateString() === today);
  const earlierTx = transactions.filter(t => new Date(t.timestamp).toDateString() !== today);

  const quickActions = [
    { label: "Send", icon: ArrowUpRight, route: "/send" },
    { label: "Request", icon: ArrowDownLeft, route: null },
    { label: "Add", icon: Plus, route: null },
    { label: "Card", icon: TrendingUp, route: "/card" },
  ];

  return (
    <View style={S.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={ACCENT} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={S.scroll}
      >
        {/* ─── TOP BAR ─── */}
        <View style={S.topBar}>
          <View>
            <Text style={S.greeting}>{user?.fullName?.split(" ")[0] || "Welcome"}</Text>
            <Text style={S.dateLabel}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</Text>
          </View>
          <TouchableOpacity style={S.avatarBtn}>
            <View style={S.avatar}>
              <Text style={S.avText}>{user?.fullName?.charAt(0) || "N"}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ─── BALANCE WHEEL ─── */}
        <View style={S.wheelSection}>
          <BalanceRing balance={balance} size={180} />
          <View style={S.wheelCenter}>
            <Text style={S.wheelWhole}>{whole}</Text>
            <Text style={S.wheelFrac}>.{frac}</Text>
            <Text style={S.wheelCurrency}>TND</Text>
          </View>
        </View>

        {/* ─── QUICK ACTIONS - staggered asymmetric grid ─── */}
        <View style={S.actionsGrid}>
          <TouchableOpacity style={[S.actionBig, { backgroundColor: ACCENT }]} onPress={() => router.push("/send")} activeOpacity={0.8}>
            <Text style={S.actionBigText}>Send{'\n'}Money</Text>
            <ArrowUpRight size={28} color="#fff" style={{ position: "absolute", right: 20, bottom: 20 }} />
          </TouchableOpacity>
          <View style={S.actionSmallCol}>
            <TouchableOpacity style={[S.actionSmall, { backgroundColor: "#1E1E3A" }]} activeOpacity={0.8}>
              <ArrowDownLeft size={18} color="#8B8BFF" />
              <Text style={S.actionSmallText}>Request</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[S.actionSmall, { backgroundColor: "#1E1E3A" }]} activeOpacity={0.8}>
              <Plus size={18} color="#5EEAD4" />
              <Text style={S.actionSmallText}>Top Up</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── TRANSACTIONS - brutalist list ─── */}
        <View style={S.txSection}>
          <Text style={S.sectionTitle}>Activity</Text>

          {todayTx.length > 0 && (
            <View style={S.txGroup}>
              <Text style={S.txGroupLabel}>TODAY</Text>
              {todayTx.map((tx) => (
                <View key={tx.id} style={S.txRow}>
                  <View style={S.txLeft}>
                    <View style={[S.txIndicator, { backgroundColor: tx.direction === "credit" ? ACCENT : "transparent", borderColor: tx.direction === "credit" ? ACCENT : "rgba(255,255,255,0.15)" }]} />
                    <View>
                      <Text style={S.txTitle} numberOfLines={1}>{tx.memo || tx.from_name || tx.to_name || "Transfer"}</Text>
                      <Text style={S.txMeta}>{tx.timestamp.slice(11, 16)} · {tx.direction === "credit" ? "RECEIVED" : "SENT"}</Text>
                    </View>
                  </View>
                  <Text style={[S.txAmount, { color: tx.direction === "credit" ? ACCENT : "#fff" }]}>
                    {tx.direction === "credit" ? "+" : "−"} {tx.amount_display.replace("TND", "").trim()}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {earlierTx.length > 0 && (
            <View style={S.txGroup}>
              <Text style={S.txGroupLabel}>EARLIER</Text>
              {earlierTx.slice(0, 5).map((tx) => (
                <View key={tx.id} style={S.txRow}>
                  <View style={S.txLeft}>
                    <View style={[S.txIndicator, { backgroundColor: tx.direction === "credit" ? ACCENT : "transparent", borderColor: tx.direction === "credit" ? ACCENT : "rgba(255,255,255,0.15)" }]} />
                    <View>
                      <Text style={S.txTitle} numberOfLines={1}>{tx.memo || tx.from_name || tx.to_name || "Transfer"}</Text>
                      <Text style={S.txMeta}>{new Date(tx.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {tx.direction === "credit" ? "RECEIVED" : "SENT"}</Text>
                    </View>
                  </View>
                  <Text style={[S.txAmount, { color: tx.direction === "credit" ? ACCENT : "#fff" }]}>
                    {tx.direction === "credit" ? "+" : "−"} {tx.amount_display.replace("TND", "").trim()}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {transactions.length === 0 && (
            <View style={S.emptyState}>
              <View style={S.emptyLine} />
              <View style={[S.emptyLine, { width: "60%" }]} />
              <Text style={S.emptyText}>No transactions yet</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { paddingBottom: 120 },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 24, paddingTop: 70, paddingBottom: 20 },
  greeting: { fontSize: 30, fontWeight: "900", color: "#fff", letterSpacing: -1 },
  dateLabel: { fontSize: 13, color: MUTED, marginTop: 4, fontWeight: "500", letterSpacing: 0.5 },
  avatarBtn: { width: 48, height: 48, borderRadius: 16, backgroundColor: SURFACE, overflow: "hidden", borderWidth: 2, borderColor: "rgba(255,107,53,0.2)" },
  avatar: { flex: 1, alignItems: "center", justifyContent: "center" },
  avText: { fontSize: 20, fontWeight: "800", color: ACCENT },

  wheelSection: { alignItems: "center", justifyContent: "center", marginVertical: 10, height: 240 },
  wheelCenter: { position: "absolute", alignItems: "center" },
  wheelWhole: { fontSize: 48, fontWeight: "900", color: "#fff", letterSpacing: -2 },
  wheelFrac: { fontSize: 20, fontWeight: "600", color: MUTED, marginTop: -4 },
  wheelCurrency: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.2)", letterSpacing: 2, marginTop: 4 },

  actionsGrid: { flexDirection: "row", paddingHorizontal: 24, gap: 12, marginTop: 10 },
  actionBig: { flex: 1, height: 130, borderRadius: 24, padding: 20, justifyContent: "flex-end", position: "relative", overflow: "hidden" },
  actionBigText: { fontSize: 20, fontWeight: "800", color: "#fff", lineHeight: 24, letterSpacing: -0.3 },
  actionSmallCol: { gap: 12 },
  actionSmall: { width: W * 0.35, height: 59, borderRadius: 20, padding: 16, justifyContent: "center", gap: 4 },
  actionSmallText: { fontSize: 12, fontWeight: "700", color: "#fff" },

  txSection: { paddingHorizontal: 24, marginTop: 32 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: MUTED, letterSpacing: 3, marginBottom: 20 },

  txGroup: { marginBottom: 24 },
  txGroupLabel: { fontSize: 10, fontWeight: "800", color: "rgba(255,255,255,0.15)", letterSpacing: 2, marginBottom: 12 },
  txRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  txLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  txIndicator: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  txTitle: { fontSize: 14, fontWeight: "600", color: "#fff", maxWidth: W * 0.4 },
  txMeta: { fontSize: 10, fontWeight: "600", color: "rgba(255,255,255,0.25)", marginTop: 3, letterSpacing: 0.5 },
  txAmount: { fontSize: 14, fontWeight: "700", letterSpacing: -0.3 },

  emptyState: { paddingVertical: 40, gap: 12, alignItems: "center" },
  emptyLine: { height: 4, width: "80%", borderRadius: 2, backgroundColor: "rgba(255,255,255,0.04)" },
  emptyText: { fontSize: 12, color: "rgba(255,255,255,0.15)", marginTop: 8, fontWeight: "600" },
});
