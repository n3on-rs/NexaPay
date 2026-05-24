import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { api } from "../src/api/client";
import { useAuth } from "../src/auth/AuthContext";

export default function RegisterScreen() {
  const { setAuth } = useAuth();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [cin, setCin] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [userAddr, setUserAddr] = useState("");

  const handleInit = async () => {
    setLoading(true); setError("");
    const res = await api.post<any>("/auth/register/init", {
      full_name: `${firstName} ${lastName}`,
      phone, email, date_of_birth: dob, cin_number: cin,
    });
    if (res.ok) {
      setUserAddr(res.data.address);
      setStep(1);
    } else setError(res.data?.error || "Registration failed");
    setLoading(false);
  };

  const handlePin = async () => {
    if (pin !== confirmPin || pin.length !== 6) { setError("PINs must match (6 digits)"); return; }
    setLoading(true); setError("");
    const res = await api.post<any>("/auth/register/set-pin", { address: userAddr, pin, pin_confirm: confirmPin });
    if (res.ok && res.data.token) {
      // Store token and navigate directly to home
      await SecureStore.setItemAsync("nexapay_token", res.data.token);
      await SecureStore.setItemAsync("nexapay_address", userAddr);
      setAuth(res.data.token, userAddr);
      router.replace("/(tabs)");
    }
    else if (res.ok) { Alert.alert("Account created!", "You can now log in."); router.replace("/login"); }
    else setError(res.data?.error || "Failed to set PIN");
    setLoading(false);
  };

  const isValid = firstName && lastName && phone.length === 8 && email && dob && cin.length >= 6;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.brand}>NexaPay</Text>
      <Text style={styles.title}>{step === 0 ? "Create Account" : "Set PIN"}</Text>
      <Text style={styles.sub}>{step === 0 ? "Fill in your details" : "Choose a 6-digit PIN for login and payments"}</Text>

      {step === 0 ? (
        <>
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor="#333" />
          <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor="#333" />
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor="#333" keyboardType="email-address" autoCapitalize="none" />
          <View style={styles.phoneRow}>
            <View style={styles.prefix}><Text style={styles.prefixText}>+216</Text></View>
            <TextInput style={styles.phoneInput} value={phone} onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(0, 8))} placeholder="55 000 000" placeholderTextColor="#333" keyboardType="phone-pad" maxLength={8} />
          </View>
          <TextInput style={styles.input} value={dob} onChangeText={setDob} placeholder="Date of birth (YYYY-MM-DD)" placeholderTextColor="#333" />
          <TextInput style={styles.input} value={cin} onChangeText={(t) => setCin(t.replace(/\D/g, ""))} placeholder="CIN Number" placeholderTextColor="#333" keyboardType="number-pad" maxLength={20} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity style={[styles.btn, !isValid && styles.btnDisabled]} onPress={handleInit} disabled={loading || !isValid}>
            {loading ? <ActivityIndicator color="#0b0b0b" /> : <Text style={styles.btnText}>Continue</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TextInput style={styles.input} value={pin} onChangeText={setPin} placeholder="6-digit PIN" placeholderTextColor="#333" keyboardType="number-pad" maxLength={6} secureTextEntry />
          <TextInput style={styles.input} value={confirmPin} onChangeText={setConfirmPin} placeholder="Confirm PIN" placeholderTextColor="#333" keyboardType="number-pad" maxLength={6} secureTextEntry />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity style={styles.btn} onPress={handlePin} disabled={loading}>
            {loading ? <ActivityIndicator color="#0b0b0b" /> : <Text style={styles.btnText}>Create Account</Text>}
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}><Text style={{ color: "#888", textAlign: "center", fontSize: 14 }}>Already have an account? <Text style={{ color: "#00d4aa", fontWeight: "600" }}>Sign in</Text></Text></TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0b" },
  content: { padding: 24, paddingTop: 60, maxWidth: 400, width: "100%", alignSelf: "center" },
  brand: { fontSize: 22, fontWeight: "700", color: "#00d4aa", textAlign: "center", marginBottom: 32, letterSpacing: 1 },
  title: { fontSize: 28, fontWeight: "700", color: "#fff", marginBottom: 4 },
  sub: { fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 24 },
  phoneRow: { flexDirection: "row", marginBottom: 12 },
  prefix: { backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, paddingHorizontal: 14, justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  prefixText: { color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: "600" },
  phoneInput: { flex: 1, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: "#fff", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", marginLeft: 8 },
  input: { backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: "#fff", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", marginBottom: 12 },
  btn: { backgroundColor: "#00d4aa", borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  btnDisabled: { opacity: 0.3 },
  btnText: { fontSize: 16, fontWeight: "700", color: "#0b0b0b" },
  error: { color: "#f87171", fontSize: 13, textAlign: "center", marginTop: 8, backgroundColor: "rgba(248,113,113,0.1)", padding: 10, borderRadius: 10 },
});
