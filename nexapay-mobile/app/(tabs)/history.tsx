import { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import { useAuth } from "../../src/auth/AuthContext";
import { api } from "../../src/api/client";
import { ArrowDownLeft, ArrowUpRight, Calendar } from "lucide-react-native";
import type { TransactionView } from "../../src/types";

export default function HistoryScreen() {
  const { token, address } = useAuth();
  const [txns, setTxns] = useState<TransactionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "received" | "sent">("all");

  const load = useCallback(async () => {
    if (!token || !address) return;
    const res = await api.get<any>(`/accounts/${address}/transactions`, { "X-Account-Token": token });
    if (res.ok && res.data.transactions) setTxns(res.data.transactions as TransactionView[]);
    setLoading(false);
  }, [token, address]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === "all" ? txns : txns.filter(t => filter === "received" ? t.direction === "credit" : t.direction === "debit");

  return (
    <View style={s.container}>
      <Text style={s.heading}>History</Text>
      <View style={s.filters}>
        {(["all", "received", "sent"] as const).map(f => (
          <TouchableOpacity key={f} style={[s.filterPill, filter === f && s.filterOn]} onPress={() => setFilter(f)}>
            <Text style={[s.filterText, filter === f && s.filterTextOn]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <ActivityIndicator color="#00d4aa" style={{ marginTop: 60 }} /> : (
        <FlatList
          data={filtered}
          keyExtractor={t => t.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          ListEmptyComponent={<View style={s.empty}><Calendar size={28} color="rgba(255,255,255,0.1)" /><Text style={s.emptyText}>No transactions</Text></View>}
          renderItem={({ item: tx, index }) => (
            <View style={[s.row, index === 0 && { borderTopWidth: 0 }]}>
              <View style={[s.dot, { backgroundColor: tx.direction === "credit" ? "rgba(0,212,170,0.15)" : "rgba(248,113,113,0.1)" }]}>
                {tx.direction === "credit" ? <ArrowDownLeft size={14} color="#00d4aa" /> : <ArrowUpRight size={14} color="#f87171" />}
              </View>
              <View style={s.info}>
                <Text style={s.name} numberOfLines={1}>{tx.memo || (tx.direction === "credit" ? `From ${tx.from_name || tx.from.slice(0, 10)}` : `To ${tx.to_name || tx.to.slice(0, 10)}`)}</Text>
                <Text style={s.date}>{new Date(tx.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {tx.timestamp.slice(11, 16)}</Text>
              </View>
              <Text style={[s.amt, { color: tx.direction === "credit" ? "#00d4aa" : "#f87171" }]}>{tx.direction === "credit" ? "+" : "−"}{tx.amount_display}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712", paddingTop: 70 },
  heading: { fontSize: 30, fontWeight: "800", color: "#fff", paddingHorizontal: 24, letterSpacing: -0.5, marginBottom: 16 },
  filters: { flexDirection: "row", gap: 8, paddingHorizontal: 24, marginBottom: 20 },
  filterPill: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.04)" },
  filterOn: { backgroundColor: "rgba(0,212,170,0.1)", borderColor: "rgba(0,212,170,0.2)" },
  filterText: { fontSize: 13, color: "rgba(255,255,255,0.3)", fontWeight: "600" },
  filterTextOn: { color: "#00d4aa" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 16, paddingHorizontal: 24, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.03)" },
  dot: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  info: { flex: 1, marginLeft: 14 },
  name: { fontSize: 14, fontWeight: "600", color: "#fff" },
  date: { fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 3 },
  amt: { fontSize: 14, fontWeight: "700" },
  empty: { alignItems: "center", paddingTop: 80 },
  emptyText: { color: "rgba(255,255,255,0.15)", fontSize: 14, marginTop: 12 },
});
