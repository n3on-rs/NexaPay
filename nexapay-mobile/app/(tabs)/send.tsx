import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useAuth } from "../../src/auth/AuthContext";
import { api } from "../../src/api/client";
import { ArrowRight, Search, User, Check, ArrowDown } from "lucide-react-native";

const ACCENT = "#FF6B35";
const BG = "#0A0A14";
const SURFACE = "rgba(255,255,255,0.03)";
const BORDER = "rgba(255,255,255,0.06)";

export default function SendScreen() {
  const { token, address: myAddr } = useAuth();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<"lookup" | "amount" | "confirm" | "done">("lookup");
  const [loading, setLoading] = useState(false);
  const [recipientInfo, setRecipientInfo] = useState<any>(null);
  const [result, setResult] = useState("");

  const handleLookup = async () => {
    if (!token || !myAddr) return;
    setLoading(true);
    const res = await api.get<any>(`/accounts/${myAddr}/search?q=${recipient}`, { "X-Account-Token": token });
    if (res.ok && res.data.results?.[0]) { setRecipientInfo(res.data.results[0]); setStep("amount"); }
    else setResult("Not found");
    setLoading(false);
  };

  const handleSend = async () => {
    if (!token || !myAddr || !recipientInfo) return;
    setLoading(true);
    const m = Math.round(parseFloat(amount) * 1000);
    const res = await api.post<any>(`/accounts/${myAddr}/transfer`, { to: recipientInfo.chain_address, amount: m, pin }, { "X-Account-Token": token });
    if (res.ok) { setResult(`Sent ${amount} TND`); setStep("done"); }
    else setResult(res.data?.error || "Failed");
    setLoading(false);
  };

  const reset = () => { setStep("lookup"); setRecipient(""); setAmount(""); setPin(""); setRecipientInfo(null); setResult(""); };

  return (
    <ScrollView style={st.container} contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">
      <Text style={st.heading}>Send{'\n'}Money</Text>

      {step === "lookup" && (
        <View style={st.card}>
          <Text style={st.label}>RECIPIENT</Text>
          <View style={st.row}>
            <TextInput style={st.field} value={recipient} onChangeText={setRecipient} placeholder="Phone or name" placeholderTextColor="rgba(255,255,255,0.1)" />
            <TouchableOpacity style={st.iconBtn} onPress={handleLookup}><Search size={18} color="#fff" /></TouchableOpacity>
          </View>
          {result ? <Text style={st.msg}>{result}</Text> : null}
        </View>
      )}

      {step === "amount" && recipientInfo && (
        <View style={st.card}>
          <View style={st.recip}>
            <View style={st.recipAvatar}><User size={16} color="#fff" /></View>
            <View><Text style={st.recipName}>{recipientInfo.full_name}</Text><Text style={st.recipAddr}>{(recipientInfo.chain_address||"").slice(0,14)}...</Text></View>
          </View>
          <Text style={st.label}>AMOUNT</Text>
          <View style={st.amtRow}>
            <TextInput style={st.amtField} value={amount} onChangeText={setAmount} placeholder="0.000" placeholderTextColor="rgba(255,255,255,0.1)" keyboardType="decimal-pad" />
            <Text style={st.currency}>TND</Text>
          </View>
          <TouchableOpacity style={st.btn} onPress={() => setStep("confirm")} disabled={!amount}><Text style={st.btnText}>Review</Text><ArrowRight size={18} color="#fff" /></TouchableOpacity>
        </View>
      )}

      {step === "confirm" && (
        <View style={st.card}>
          <View style={st.confirmBox}>
            <ArrowDown size={20} color={ACCENT} />
            <Text style={st.confirmAmt}>{amount} TND</Text>
            <Text style={st.confirmTo}>to {recipientInfo?.full_name}</Text>
          </View>
          <Text style={st.label}>CONFIRM WITH PIN</Text>
          <TextInput style={st.field} value={pin} onChangeText={setPin} placeholder="······" placeholderTextColor="rgba(255,255,255,0.1)" keyboardType="number-pad" maxLength={6} secureTextEntry />
          <TouchableOpacity style={st.btn} onPress={handleSend} disabled={loading||pin.length<6}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnText}>Confirm & Send</Text>}</TouchableOpacity>
          <TouchableOpacity onPress={() => setStep("amount")}><Text style={st.backLink}>Change amount</Text></TouchableOpacity>
        </View>
      )}

      {step === "done" && (
        <View style={[st.card, { alignItems: "center" }]}>
          <View style={st.doneCircle}><Check size={28} color="#fff" /></View>
          <Text style={st.doneTitle}>Sent!</Text>
          <Text style={st.doneSub}>{result}</Text>
          <TouchableOpacity style={st.btn} onPress={reset}><Text style={st.btnText}>Send Another</Text></TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { padding: 24, paddingTop: 70, paddingBottom: 120 },
  heading: { fontSize: 36, fontWeight: "900", color: "#fff", letterSpacing: -1, lineHeight: 40, marginBottom: 28 },
  card: { backgroundColor: SURFACE, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: BORDER, marginBottom: 16 },
  label: { fontSize: 10, fontWeight: "800", color: "rgba(255,255,255,0.2)", letterSpacing: 2, marginBottom: 10 },
  row: { flexDirection: "row", gap: 10 },
  field: { flex: 1, backgroundColor: "rgba(255,255,255,0.02)", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15, fontSize: 15, color: "#fff", borderWidth: 1, borderColor: BORDER, fontWeight: "500" },
  iconBtn: { backgroundColor: ACCENT, width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  msg: { color: "rgba(255,255,255,0.3)", fontSize: 13, marginTop: 10 },
  recip: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20, backgroundColor: "rgba(255,107,53,0.05)", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(255,107,53,0.08)" },
  recipAvatar: { width: 36, height: 36, borderRadius: 12, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center" },
  recipName: { fontSize: 14, fontWeight: "700", color: "#fff" },
  recipAddr: { fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: "monospace", marginTop: 2 },
  amtRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  amtField: { flex: 1, fontSize: 44, fontWeight: "900", color: "#fff", letterSpacing: -1, paddingVertical: 4 },
  currency: { fontSize: 16, fontWeight: "700", color: "rgba(255,255,255,0.15)", marginLeft: 8 },
  btn: { backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 },
  btnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  backLink: { textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 13, marginTop: 16 },
  confirmBox: { alignItems: "center", padding: 24, backgroundColor: "rgba(255,107,53,0.04)", borderRadius: 18, marginBottom: 20, borderWidth: 1, borderColor: "rgba(255,107,53,0.08)" },
  confirmAmt: { fontSize: 36, fontWeight: "900", color: ACCENT, letterSpacing: -1, marginTop: 8 },
  confirmTo: { fontSize: 14, color: "rgba(255,255,255,0.3)", marginTop: 4 },
  doneCircle: { width: 64, height: 64, borderRadius: 20, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  doneTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  doneSub: { fontSize: 14, color: "rgba(255,255,255,0.3)", marginTop: 4, textAlign: "center", marginBottom: 12 },
});
