import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Animated } from "react-native";
import { useAuth } from "../../src/auth/AuthContext";
import { api } from "../../src/api/client";
import { ArrowRight, Search, User, Check, ArrowDown } from "lucide-react-native";

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
    else setResult("No account found");
    setLoading(false);
  };

  const handleSend = async () => {
    if (!token || !myAddr || !recipientInfo) return;
    setLoading(true);
    const millimes = Math.round(parseFloat(amount) * 1000);
    const res = await api.post<any>(`/accounts/${myAddr}/transfer`, { to: recipientInfo.chain_address, amount: millimes, pin }, { "X-Account-Token": token });
    if (res.ok) { setResult(`Sent ${amount} TND to ${recipientInfo.full_name}`); setStep("done"); }
    else setResult(res.data?.error || "Transfer failed");
    setLoading(false);
  };

  const reset = () => { setStep("lookup"); setRecipient(""); setAmount(""); setPin(""); setRecipientInfo(null); setResult(""); };

  return (
    <ScrollView style={st.container} contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">
      <Text style={st.heading}>Send Money</Text>
      <Text style={st.sub}>Transfer to any NexaPay wallet instantly</Text>

      {step === "lookup" && (
        <View style={st.card}>
          <Text style={st.cardTitle}>Recipient</Text>
          <View style={st.searchRow}>
            <TextInput style={st.input} value={recipient} onChangeText={setRecipient} placeholder="Phone number or name" placeholderTextColor="rgba(255,255,255,0.15)" />
            <TouchableOpacity style={st.lookupBtn} onPress={handleLookup} disabled={loading || !recipient}>
              {loading ? <ActivityIndicator color="#030712" /> : <Search size={18} color="#030712" />}
            </TouchableOpacity>
          </View>
          {result ? <Text style={st.err}>{result}</Text> : null}
        </View>
      )}

      {step === "amount" && recipientInfo && (
        <View style={st.card}>
          <View style={st.recipient}>
            <View style={st.recipAvatar}><User size={16} color="#fff" /></View>
            <View>
              <Text style={st.recipName}>{recipientInfo.full_name}</Text>
              <Text style={st.recipAddr}>{(recipientInfo.chain_address || "").slice(0, 14)}...</Text>
            </View>
          </View>
          <Text style={st.cardTitle}>Amount</Text>
          <View style={st.amountRow}>
            <TextInput style={st.amountInput} value={amount} onChangeText={setAmount} placeholder="0.000" placeholderTextColor="rgba(255,255,255,0.1)" keyboardType="decimal-pad" />
            <Text style={st.currency}>TND</Text>
          </View>
          <TouchableOpacity style={[st.btn, !amount && st.btnOff]} onPress={() => setStep("confirm")} disabled={!amount}>
            <Text style={st.btnText}>Review</Text><ArrowRight size={18} color="#030712" />
          </TouchableOpacity>
        </View>
      )}

      {step === "confirm" && (
        <View style={st.card}>
          <View style={st.confirmBox}>
            <ArrowDown size={20} color="#00d4aa" />
            <Text style={st.confirmAmt}>{amount} TND</Text>
            <Text style={st.confirmTo}>to {recipientInfo?.full_name}</Text>
          </View>
          <TextInput style={st.input} value={pin} onChangeText={setPin} placeholder="6-digit PIN" placeholderTextColor="rgba(255,255,255,0.15)" keyboardType="number-pad" maxLength={6} secureTextEntry />
          <TouchableOpacity style={[st.btn, pin.length < 6 && st.btnOff]} onPress={handleSend} disabled={loading || pin.length < 6}>
            {loading ? <ActivityIndicator color="#030712" /> : <Text style={st.btnText}>Confirm & Send</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep("amount")}><Text style={st.backText}>Change amount</Text></TouchableOpacity>
        </View>
      )}

      {step === "done" && (
        <View style={[st.card, { alignItems: "center" }]}>
          <View style={st.doneCircle}><Check size={32} color="#030712" /></View>
          <Text style={st.doneTitle}>Transfer Sent!</Text>
          <Text style={st.doneSub}>{result}</Text>
          <TouchableOpacity style={st.btn} onPress={reset}><Text style={st.btnText}>Send Another</Text></TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712" },
  scroll: { padding: 24, paddingTop: 70, paddingBottom: 120 },
  heading: { fontSize: 30, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  sub: { fontSize: 14, color: "rgba(255,255,255,0.3)", marginBottom: 28 },
  card: { backgroundColor: "rgba(12,18,28,0.8)", borderRadius: 24, padding: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", marginBottom: 16 },
  cardTitle: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.3)", letterSpacing: 1, marginBottom: 12, textTransform: "uppercase" },
  searchRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  input: { flex: 1, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 16, paddingHorizontal: 18, paddingVertical: 15, fontSize: 15, color: "#fff", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  lookupBtn: { backgroundColor: "#00d4aa", width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  err: { color: "#f87171", fontSize: 13, marginTop: 8 },
  recipient: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20, backgroundColor: "rgba(0,212,170,0.05)", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "rgba(0,212,170,0.08)" },
  recipAvatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: "#00d4aa", alignItems: "center", justifyContent: "center" },
  recipName: { fontSize: 15, fontWeight: "700", color: "#fff" },
  recipAddr: { fontSize: 11, color: "rgba(255,255,255,0.25)", fontFamily: "monospace", marginTop: 2 },
  amountRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  amountInput: { flex: 1, fontSize: 40, fontWeight: "800", color: "#fff", letterSpacing: -1, paddingVertical: 8 },
  currency: { fontSize: 18, fontWeight: "700", color: "rgba(255,255,255,0.2)", marginLeft: 8 },
  btn: { backgroundColor: "#00d4aa", borderRadius: 20, paddingVertical: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 },
  btnOff: { opacity: 0.2 },
  btnText: { fontSize: 16, fontWeight: "700", color: "#030712" },
  backText: { textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 14, marginTop: 16 },
  confirmBox: { alignItems: "center", padding: 24, backgroundColor: "rgba(0,212,170,0.04)", borderRadius: 20, marginBottom: 20, borderWidth: 1, borderColor: "rgba(0,212,170,0.08)" },
  confirmAmt: { fontSize: 36, fontWeight: "900", color: "#00d4aa", letterSpacing: -1, marginTop: 8 },
  confirmTo: { fontSize: 14, color: "rgba(255,255,255,0.4)", marginTop: 4 },
  doneCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#00d4aa", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  doneTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  doneSub: { fontSize: 14, color: "rgba(255,255,255,0.4)", marginTop: 4, textAlign: "center", marginBottom: 12 },
});
