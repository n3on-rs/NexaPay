import { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import { useAuth } from "../../src/auth/AuthContext";
import { api } from "../../src/api/client";
import { ArrowDownLeft, ArrowUpRight, Filter } from "lucide-react-native";
import type { TransactionView } from "../../src/types";

export default function HistoryScreen() {
  const { token, address } = useAuth();
  const [txns, setTxns] = useState<TransactionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "sent" | "received">("all");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!token || !address) return;
    const res = await api.get<any>(`/accounts/${address}/transactions`, { "X-Account-Token": token });
    if (res.ok && res.data.transactions) setTxns(res.data.transactions as TransactionView[]);
    setLoading(false);
  }, [token, address]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === "all" ? txns : txns.filter(t => filter === "received" ? t.direction === "credit" : t.direction === "debit");

  const renderItem = ({ item: tx }: { item: TransactionView }) => (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: tx.direction === "credit" ? "rgba(0,212,170,0.1)" : "rgba(248,113,113,0.1)" }]}>
        {tx.direction === "credit" ? <ArrowDownLeft size={16} color="#00d4aa" /> : <ArrowUpRight size={16} color="#f87171" />}
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{tx.memo || (tx.direction === "credit" ? `From ${tx.from_name || tx.from.slice(0, 10)}` : `To ${tx.to_name || tx.to.slice(0, 10)}`)}</Text>
        <Text style={styles.date}>{new Date(tx.timestamp).toLocaleDateString()} · {tx.timestamp.slice(11, 16)}</Text>
      </View>
      <Text style={[styles.amount, { color: tx.direction === "credit" ? "#00d4aa" : "#f87171" }]}>{tx.direction === "credit" ? "+" : "-"}{tx.amount_display}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Transactions</Text>
      <View style={styles.filters}>
        {(["all", "received", "sent"] as const).map(f => (
          <TouchableOpacity key={f} style={[styles.filterBtn, filter === f && styles.filterActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator color="#00d4aa" style={{ marginTop: 40 }} /> : (
        <FlatList data={filtered} renderItem={renderItem} keyExtractor={t => t.id} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0b", paddingHorizontal: 20, paddingTop: 60 },
  heading: { fontSize: 28, fontWeight: "700", color: "#fff", marginBottom: 16 },
  filters: { flexDirection: "row", gap: 8, marginBottom: 20 },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  filterActive: { backgroundColor: "rgba(0,212,170,0.15)", borderColor: "rgba(0,212,170,0.3)" },
  filterText: { fontSize: 13, color: "#888", fontWeight: "500" },
  filterTextActive: { color: "#00d4aa" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  info: { flex: 1, marginLeft: 12 },
  name: { fontSize: 14, fontWeight: "600", color: "#fff" },
  date: { fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 },
  amount: { fontSize: 14, fontWeight: "700" },
});
