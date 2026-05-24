import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../src/auth/AuthContext";
import { FontAwesome6 } from "@expo/vector-icons";

export default function LoginScreen() {
  const { login, verifyOtp } = useAuth();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [devOtp, setDevOtp] = useState("");

  const handleLogin = async () => {
    setError(""); setLoading(true);
    try {
      const res = await login(phone, pin);
      if (res.error) { setError(res.error); }
      else if (res.step === "otp_required") {
        if (res.devOtp) setDevOtp(res.devOtp);
        setStep("otp");
      }
    } catch { setError("Network error"); }
    setLoading(false);
  };

  const handleOtp = async () => {
    setError(""); setLoading(true);
    try {
      const ok = await verifyOtp(phone, otp);
      if (ok) router.replace("/(tabs)");
      else setError("Invalid OTP");
    } catch { setError("Network error"); }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <View style={styles.content}>
        <View style={styles.brand}>
          <View style={styles.logoCircle}><FontAwesome6 name="n" size={28} color="#00d4aa" /></View>
          <Text style={styles.brandText}>NexaPay</Text>
        </View>

        {step === "phone" ? (
          <>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to your account</Text>

            <View style={styles.phoneRow}>
              <View style={styles.prefix}><Text style={styles.prefixText}>🇹🇳 +216</Text></View>
              <TextInput style={styles.phoneInput} value={phone} onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(0, 8))} placeholder="55 000 000" placeholderTextColor="#333" keyboardType="phone-pad" maxLength={8} />
            </View>

            <TextInput style={styles.input} value={pin} onChangeText={setPin} placeholder="6-digit PIN" placeholderTextColor="#333" keyboardType="number-pad" maxLength={6} secureTextEntry />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity style={[styles.button, (!phone || pin.length < 6) && styles.buttonDisabled]} onPress={handleLogin} disabled={loading || !phone || pin.length < 6}>
              {loading ? <ActivityIndicator color="#0b0b0b" /> : <Text style={styles.buttonText}>Sign In</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>Enter OTP</Text>
            <Text style={styles.subtitle}>A 6-digit code was sent to your phone</Text>
            {devOtp ? <Text style={styles.devOtp}>Dev OTP: {devOtp}</Text> : null}

            <TextInput style={styles.input} value={otp} onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))} placeholder="000000" placeholderTextColor="#333" keyboardType="number-pad" maxLength={6} />
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity style={[styles.button, otp.length < 6 && styles.buttonDisabled]} onPress={handleOtp} disabled={loading || otp.length < 6}>
              {loading ? <ActivityIndicator color="#0b0b0b" /> : <Text style={styles.buttonText}>Verify</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setStep("phone")}><Text style={styles.link}>Go back</Text></TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => router.push("/register")} style={styles.registerLink}>
          <Text style={styles.link}>Don't have an account? <Text style={{ color: "#00d4aa", fontWeight: "600" }}>Sign up</Text></Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0b" },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: 24, maxWidth: 400, width: "100%", alignSelf: "center" },
  brand: { alignItems: "center", marginBottom: 40, flexDirection: "row", justifyContent: "center", gap: 10 },
  logoCircle: { width: 48, height: 48, borderRadius: 14, backgroundColor: "rgba(0,212,170,0.1)", alignItems: "center", justifyContent: "center" },
  brandText: { fontSize: 26, fontWeight: "700", color: "#fff", letterSpacing: 1 },
  title: { fontSize: 28, fontWeight: "700", color: "#fff", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 24 },
  phoneRow: { flexDirection: "row", marginBottom: 12 },
  prefix: { backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, paddingHorizontal: 14, justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  prefixText: { color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: "600" },
  phoneInput: { flex: 1, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: "#fff", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", marginLeft: 8 },
  input: { backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: "#fff", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", marginBottom: 12 },
  button: { backgroundColor: "#00d4aa", borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  buttonDisabled: { opacity: 0.3 },
  buttonText: { fontSize: 16, fontWeight: "700", color: "#0b0b0b" },
  error: { color: "#f87171", fontSize: 13, textAlign: "center", marginTop: 8, backgroundColor: "rgba(248,113,113,0.1)", padding: 10, borderRadius: 10 },
  link: { textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 16 },
  registerLink: { marginTop: 32 },
  devOtp: { color: "#00d4aa", fontSize: 13, textAlign: "center", backgroundColor: "rgba(0,212,170,0.1)", padding: 8, borderRadius: 8, marginBottom: 12, fontFamily: "monospace" },
});
