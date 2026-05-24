import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useAuth } from "../../src/auth/AuthContext";
import { api } from "../../src/api/client";
import { ArrowRight, Search, User as UserIcon } from "lucide-react-native";

export default function SendScreen() {
  const { token, address: myAddr } = useAuth();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [recipientInfo, setRecipientInfo] = useState<any>(null);

  const handleLookup = async () => {
    if (!token || !myAddr) return;
    const res = await api.get<any>(`/accounts/${myAddr}/search?q=${recipient}`, { "X-Account-Token": token });
    if (res.ok && res.data.results?.[0]) setRecipientInfo(res.data.results[0]);
    else Alert.alert("Not found", "No account found for this phone or name");
  };

  const handleSend = async () => {
    if (!token || !myAddr || !recipientInfo || !amount || pin.length !== 6) return;
    setLoading(true);
    const millimes = Math.round(parseFloat(amount) * 1000);
    const res = await api.post<any>(`/accounts/${myAddr}/transfer`, { to: recipientInfo.chain_address, amount: millimes, pin }, { "X-Account-Token": token });
    if (res.ok) {
      setResult(`Sent ${amount} TND to ${recipientInfo.full_name}`);
      setStep("form"); setRecipient(""); setAmount(""); setPin(""); setRecipientInfo(null);
    } else setResult(res.data?.error || "Transfer failed");
    setLoading(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Send Money</Text>
      <Text style={styles.sub}>Transfer instantly to any NexaPay user</Text>

      {step === "form" ? (
        <>
          <View style={styles.searchRow}>
            <TextInput style={styles.input} value={recipient} onChangeText={setRecipient} placeholder="Phone or name" placeholderTextColor="#333" />
            <TouchableOpacity style={styles.lookupBtn} onPress={handleLookup}><Search size={18} color="#0b0b0b" /></TouchableOpacity>
          </View>

          {recipientInfo && (
            <View style={styles.recipientCard}>
              <UserIcon size={16} color="#00d4aa" />
              <View style={{ marginLeft: 8 }}>
                <Text style={styles.recipientName}>{recipientInfo.full_name}</Text>
                <Text style={styles.recipientAddr}>{(recipientInfo.chain_address || "").slice(0, 16)}...</Text>
              </View>
            </View>
          )}

          <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="Amount (TND)" placeholderTextColor="#333" keyboardType="decimal-pad" />

          {recipientInfo && amount ? (
            <TouchableOpacity style={styles.btn} onPress={() => setStep("confirm")}><Text style={styles.btnText}>Continue</Text><ArrowRight size={18} color="#0b0b0b" /></TouchableOpacity>
          ) : null}
        </>
      ) : (
        <>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmLabel}>Sending</Text>
            <Text style={styles.confirmAmount}>{amount} TND</Text>
            <Text style={styles.confirmTo}>to {recipientInfo?.full_name}</Text>
          </View>
          <TextInput style={styles.input} value={pin} onChangeText={setPin} placeholder="6-digit PIN" placeholderTextColor="#333" keyboardType="number-pad" maxLength={6} secureTextEntry />
          <TouchableOpacity style={[styles.btn, pin.length < 6 && styles.btnDisabled]} onPress={handleSend} disabled={loading || pin.length < 6}>
            {loading ? <ActivityIndicator color="#0b0b0b" /> : <Text style={styles.btnText}>Confirm & Send</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep("form")}><Text style={styles.backLink}>Back</Text></TouchableOpacity>
        </>
      )}

      {result && <Text style={[styles.result, { color: result.includes("Sent") ? "#00d4aa" : "#f87171" }]}>{result}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0b" },
  content: { padding: 20, paddingTop: 60 },
  heading: { fontSize: 28, fontWeight: "700", color: "#fff", marginBottom: 4 },
  sub: { fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 24 },
  searchRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  lookupBtn: { backgroundColor: "#00d4aa", width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: "#fff", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", marginBottom: 12 },
  recipientCard: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,212,170,0.06)", borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "rgba(0,212,170,0.1)" },
  recipientName: { fontSize: 14, fontWeight: "600", color: "#fff" },
  recipientAddr: { fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" },
  btn: { backgroundColor: "#00d4aa", borderRadius: 14, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 },
  btnDisabled: { opacity: 0.3 },
  btnText: { fontSize: 16, fontWeight: "700", color: "#0b0b0b" },
  backLink: { textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 16 },
  confirmCard: { backgroundColor: "#111", borderRadius: 16, padding: 20, alignItems: "center", marginBottom: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  confirmLabel: { fontSize: 12, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, fontWeight: "600" },
  confirmAmount: { fontSize: 32, fontWeight: "800", color: "#00d4aa", marginTop: 4 },
  confirmTo: { fontSize: 14, color: "rgba(255,255,255,0.5)", marginTop: 4 },
  result: { marginTop: 16, textAlign: "center", fontSize: 14, fontWeight: "600", padding: 12, borderRadius: 10 },
});
