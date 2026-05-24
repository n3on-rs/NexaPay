import { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import { useAuth } from "../../src/auth/AuthContext";
import { api } from "../../src/api/client";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react-native";
import type { TransactionView } from "../../src/types";

const ACCENT = "#FF6B35";
const BG = "#0A0A14";

export default function HistoryScreen() {
  const { token, address } = useAuth();
  const [txns, setTxns] = useState<TransactionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all"|"in"|"out">("all");

  const load = useCallback(async () => {
    if (!token || !address) return;
    const res = await api.get<any>(`/accounts/${address}/transactions`, { "X-Account-Token": token });
    if (res.ok && res.data.transactions) setTxns(res.data.transactions as TransactionView[]);
    setLoading(false);
  }, [token, address]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === "all" ? txns : txns.filter(t => filter === "in" ? t.direction === "credit" : t.direction === "debit");

  return (
    <View style={s.container}>
      <Text style={s.heading}>History</Text>
      <View style={s.filters}>
        {(["all","in","out"] as const).map(f => (
          <TouchableOpacity key={f} style={[s.filt, filter===f&&s.filtOn]} onPress={()=>setFilter(f)}>
            <Text style={[s.filtText, filter===f&&s.filtTextOn]}>{f==="all"?"All":f==="in"?"Received":"Sent"}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator color={ACCENT} style={{marginTop:60}} /> : (
        <FlatList data={filtered} keyExtractor={t=>t.id} showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:120}}
          ListEmptyComponent={<View style={s.empty}><Text style={s.emptyText}>No transactions</Text></View>}
          renderItem={({item:tx})=>(
            <View style={s.row}>
              <View style={[s.dot,{backgroundColor: tx.direction==="credit"?"rgba(255,107,53,0.1)":"rgba(255,80,80,0.08)"}]}>
                {tx.direction==="credit"?<ArrowDownLeft size={13} color={ACCENT}/>:<ArrowUpRight size={13} color="#ff5050"/>}
              </View>
              <View style={s.info}>
                <Text style={s.txName} numberOfLines={1}>{tx.memo||tx.from_name||tx.to_name||"Transfer"}</Text>
                <Text style={s.txDate}>{new Date(tx.timestamp).toLocaleDateString("en-US",{month:"short",day:"numeric"})} · {tx.timestamp.slice(11,16)}</Text>
              </View>
              <Text style={[s.amt,{color:tx.direction==="credit"?ACCENT:"#ff5050"}]}>{tx.direction==="credit"?"+":"−"}{tx.amount_display.replace(" TND","")}</Text>
            </View>
          )} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex:1, backgroundColor:BG, paddingTop:70 },
  heading: { fontSize:36, fontWeight:"900", color:"#fff", paddingHorizontal:24, letterSpacing:-1, marginBottom:16 },
  filters: { flexDirection:"row", gap:8, paddingHorizontal:24, marginBottom:20 },
  filt: { paddingHorizontal:16, paddingVertical:8, borderRadius:20, backgroundColor:"rgba(255,255,255,0.03)", borderWidth:1, borderColor:"rgba(255,255,255,0.04)" },
  filtOn: { backgroundColor:"rgba(255,107,53,0.1)", borderColor:"rgba(255,107,53,0.15)" },
  filtText: { fontSize:12, fontWeight:"700", color:"rgba(255,255,255,0.25)" },
  filtTextOn: { color:ACCENT },
  row: { flexDirection:"row", alignItems:"center", paddingVertical:14, paddingHorizontal:24, borderBottomWidth:1, borderBottomColor:"rgba(255,255,255,0.03)" },
  dot: { width:34, height:34, borderRadius:10, alignItems:"center", justifyContent:"center" },
  info: { flex:1, marginLeft:12 },
  txName: { fontSize:14, fontWeight:"600", color:"#fff" },
  txDate: { fontSize:10, fontWeight:"600", color:"rgba(255,255,255,0.2)", marginTop:3, letterSpacing:0.3 },
  amt: { fontSize:14, fontWeight:"700" },
  empty: { alignItems:"center", paddingTop:80 },
  emptyText: { color:"rgba(255,255,255,0.1)", fontSize:13, fontWeight:"600" },
});
