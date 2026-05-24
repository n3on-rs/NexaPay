import { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Animated, Dimensions } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../src/auth/AuthContext";
import { ArrowRight, Shield, Fingerprint, ChevronLeft } from "lucide-react-native";

const { width: W } = Dimensions.get("window");

export default function LoginScreen() {
  const { login, verifyOtp, isBiometricAvailable, authenticateWithBiometrics } = useAuth();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const slideAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 0.5, duration: 2500, useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 1, duration: 2500, useNativeDriver: true }),
    ])).start();
  }, []);

  const animateStep = (to: "phone" | "otp") => {
    Animated.timing(slideAnim, { toValue: to === "otp" ? 1 : 0, duration: 350, useNativeDriver: true }).start();
    setStep(to);
  };

  const handleLogin = async () => {
    setError(""); setLoading(true);
    const res = await login(phone, pin);
    if (res.error) setError(res.error);
    else if (res.step === "otp_required") { if (res.devOtp) setDevOtp(res.devOtp); animateStep("otp"); }
    setLoading(false);
  };

  const handleOtp = async () => {
    setError(""); setLoading(true);
    const ok = await verifyOtp(phone, otp);
    if (ok) router.replace("/(tabs)");
    else setError("Invalid verification code");
    setLoading(false);
  };

  const handleBiometric = async () => {
    const ok = await authenticateWithBiometrics();
    if (ok) router.replace("/(tabs)");
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.container}>
      {/* Animated background orbs */}
      <Animated.View style={[s.orb1, { opacity: glowAnim }]} />
      <Animated.View style={[s.orb2, { opacity: Animated.subtract(1, glowAnim) }]} />

      <View style={s.content}>
        {/* Logo */}
        <View style={s.logoWrap}>
          <View style={s.logoRing}>
            <View style={s.logoInner}>
              <Shield size={28} color="#00d4aa" />
            </View>
          </View>
          <Text style={s.brand}>NexaPay</Text>
          <Text style={s.tagline}>The future of payments</Text>
        </View>

        {/* Step indicator */}
        <View style={s.steps}>
          <View style={[s.stepDot, step === "phone" && s.stepActive]} />
          <View style={[s.stepLine, step === "otp" && { backgroundColor: "#00d4aa" }]} />
          <View style={[s.stepDot, step === "otp" && s.stepActive]} />
        </View>

        {step === "phone" ? (
          <Animated.View style={[s.form, { transform: [{ translateX: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -W] }) }], opacity: slideAnim.interpolate({ inputRange: [0, 0.3], outputRange: [1, 0] }) }]}>
            <Text style={s.title}>Welcome back</Text>
            <Text style={s.sub}>Sign in to continue</Text>

            <View style={s.phoneWrap}>
              <View style={s.prefix}><Text style={s.prefixText}>+216</Text></View>
              <TextInput style={s.phoneInput} value={phone} onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(0, 8))} placeholder="Mobile number" placeholderTextColor="rgba(255,255,255,0.15)" keyboardType="phone-pad" maxLength={8} />
            </View>

            <TextInput style={s.input} value={pin} onChangeText={setPin} placeholder="6-digit PIN" placeholderTextColor="rgba(255,255,255,0.15)" keyboardType="number-pad" maxLength={6} secureTextEntry />

            {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}

            <TouchableOpacity style={[s.btn, (!phone || pin.length < 6) && s.btnOff]} onPress={handleLogin} disabled={loading || !phone || pin.length < 6}>
              <View style={s.btnGlow} />
              {loading ? <ActivityIndicator color="#030712" /> : <><Text style={s.btnText}>Continue</Text><ArrowRight size={18} color="#030712" /></>}
            </TouchableOpacity>

            {isBiometricAvailable && (
              <TouchableOpacity style={s.bioBtn} onPress={handleBiometric}>
                <Fingerprint size={18} color="#00d4aa" />
                <Text style={s.bioText}>Use fingerprint</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        ) : (
          <Animated.View style={[s.form, { transform: [{ translateX: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [W, 0] }) }], opacity: slideAnim.interpolate({ inputRange: [0.7, 1], outputRange: [0, 1] }) }]}>
            <TouchableOpacity style={s.backBtn} onPress={() => animateStep("phone")}>
              <ChevronLeft size={18} color="rgba(255,255,255,0.5)" /><Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Back</Text>
            </TouchableOpacity>

            <Text style={s.title}>Verify</Text>
            <Text style={s.sub}>Enter the code sent to your phone</Text>

            {devOtp ? (
              <View style={s.otpBox}>
                <Text style={s.otpHint}>DEV CODE</Text>
                <Text style={s.otpCode}>{devOtp}</Text>
              </View>
            ) : null}

            <TextInput style={[s.input, s.otpInput]} value={otp} onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))} placeholder="000000" placeholderTextColor="rgba(255,255,255,0.15)" keyboardType="number-pad" maxLength={6} />

            {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}

            <TouchableOpacity style={[s.btn, otp.length < 6 && s.btnOff]} onPress={handleOtp} disabled={loading || otp.length < 6}>
              <View style={s.btnGlow} />
              {loading ? <ActivityIndicator color="#030712" /> : <Text style={s.btnText}>Verify & Enter</Text>}
            </TouchableOpacity>
          </Animated.View>
        )}

        <TouchableOpacity onPress={() => router.push("/register")}>
          <Text style={s.footerLink}>New to NexaPay? <Text style={{ color: "#00d4aa", fontWeight: "700" }}>Create account</Text></Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712" },
  orb1: { position: "absolute", top: -100, right: -80, width: 320, height: 320, borderRadius: 160, backgroundColor: "rgba(0,212,170,0.04)" },
  orb2: { position: "absolute", bottom: -120, left: -100, width: 340, height: 340, borderRadius: 170, backgroundColor: "rgba(99,102,241,0.04)" },
  content: { flex: 1, paddingHorizontal: 28, justifyContent: "center", maxWidth: 420, width: "100%", alignSelf: "center" },
  logoWrap: { alignItems: "center", marginBottom: 36 },
  logoRing: { padding: 3, borderRadius: 28, borderWidth: 1.5, borderColor: "rgba(0,212,170,0.2)" },
  logoInner: { width: 56, height: 56, borderRadius: 24, backgroundColor: "rgba(0,212,170,0.08)", alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 26, fontWeight: "800", color: "#fff", marginTop: 12, letterSpacing: -0.5 },
  tagline: { fontSize: 13, color: "rgba(255,255,255,0.25)", marginTop: 4, letterSpacing: 1 },
  steps: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 32, gap: 8 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.1)" },
  stepActive: { backgroundColor: "#00d4aa", width: 10, height: 10, borderRadius: 5 },
  stepLine: { width: 32, height: 1.5, backgroundColor: "rgba(255,255,255,0.08)" },
  form: { width: "100%" },
  title: { fontSize: 32, fontWeight: "800", color: "#fff", letterSpacing: -0.5, marginBottom: 4 },
  sub: { fontSize: 14, color: "rgba(255,255,255,0.3)", marginBottom: 28 },
  phoneWrap: { flexDirection: "row", marginBottom: 12 },
  prefix: { backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 16, paddingHorizontal: 16, justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  prefixText: { color: "rgba(255,255,255,0.4)", fontSize: 14, fontWeight: "600" },
  phoneInput: { flex: 1, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 16, paddingHorizontal: 18, paddingVertical: 16, fontSize: 16, color: "#fff", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", marginLeft: 10 },
  input: { backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 16, paddingHorizontal: 18, paddingVertical: 16, fontSize: 16, color: "#fff", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", marginBottom: 12 },
  otpInput: { fontSize: 28, textAlign: "center", letterSpacing: 12, fontWeight: "700" },
  otpBox: { backgroundColor: "rgba(0,212,170,0.06)", borderRadius: 16, padding: 16, alignItems: "center", marginBottom: 16, borderWidth: 1, borderColor: "rgba(0,212,170,0.1)" },
  otpHint: { fontSize: 10, fontWeight: "700", color: "rgba(0,212,170,0.4)", letterSpacing: 2 },
  otpCode: { fontSize: 24, fontWeight: "800", color: "#00d4aa", letterSpacing: 4, fontFamily: "monospace", marginTop: 4 },
  errorBox: { backgroundColor: "rgba(248,113,113,0.08)", borderRadius: 14, padding: 14, marginTop: 4, marginBottom: 8, borderWidth: 1, borderColor: "rgba(248,113,113,0.1)" },
  errorText: { color: "#f87171", fontSize: 13, textAlign: "center", fontWeight: "500" },
  btn: { backgroundColor: "#00d4aa", borderRadius: 20, paddingVertical: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, overflow: "hidden" },
  btnGlow: { position: "absolute", top: -20, left: -20, width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(255,255,255,0.15)" },
  btnOff: { opacity: 0.25 },
  btnText: { fontSize: 16, fontWeight: "700", color: "#030712" },
  bioBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20, padding: 12 },
  bioText: { color: "#00d4aa", fontSize: 14, fontWeight: "600" },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 20 },
  footerLink: { textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 14, marginTop: 40 },
});
