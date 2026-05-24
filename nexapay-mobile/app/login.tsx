import { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Animated, Dimensions } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../src/auth/AuthContext";
import { ArrowRight, Fingerprint } from "lucide-react-native";
import Svg, { Circle, Rect as SvgRect } from "react-native-svg";

const { width: W, height: H } = Dimensions.get("window");
const ACCENT = "#FF6B35";

export default function LoginScreen() {
  const { login, verifyOtp, isBiometricAvailable, authenticateWithBiometrics } = useAuth();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [devOtp, setDevOtp] = useState("");

  const handleLogin = async () => {
    setError(""); setLoading(true);
    const res = await login(phone, pin);
    if (res.error) setError(res.error);
    else if (res.step === "otp_required") { if (res.devOtp) setDevOtp(res.devOtp); setStep("otp"); }
    setLoading(false);
  };

  const handleOtp = async () => {
    setError(""); setLoading(true);
    const ok = await verifyOtp(phone, otp);
    if (ok) router.replace("/(tabs)");
    else setError("Invalid code");
    setLoading(false);
  };

  const handleBio = async () => { if (await authenticateWithBiometrics()) router.replace("/(tabs)"); };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.container}>
      {/* Abstract geometric shapes */}
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        <Circle cx={W * 0.85} cy={H * 0.15} r={120} fill="none" stroke="rgba(255,107,53,0.08)" strokeWidth={1} />
        <Circle cx={W * 0.85} cy={H * 0.15} r={80} fill="none" stroke="rgba(255,107,53,0.05)" strokeWidth={2} />
        <Circle cx={W * 0.15} cy={H * 0.75} r={90} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
        <SvgRect x={W * 0.05} y={H * 0.55} width={40} height={40} rx={8} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={1.5} transform={`rotate(15, ${W*0.05+20}, ${H*0.55+20})`} />
      </Svg>

      <View style={s.content}>
        {/* Logo mark */}
        <View style={s.logo}>
          <View style={s.logoBox}>
            <View style={s.logoDot} />
            <View style={[s.logoDot, { backgroundColor: "rgba(255,107,53,0.3)" }]} />
          </View>
          <Text style={s.brand}>nexapay</Text>
        </View>

        {step === "phone" ? (
          <>
            <Text style={s.heading}>Sign in to{'\n'}your account</Text>

            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>PHONE</Text>
              <View style={s.phoneRow}>
                <View style={s.prefix}><Text style={s.prefixText}>+216</Text></View>
                <TextInput style={s.field} value={phone} onChangeText={t => setPhone(t.replace(/\D/g,"").slice(0,8))} placeholder="00 000 000" placeholderTextColor="rgba(255,255,255,0.1)" keyboardType="phone-pad" maxLength={8} />
              </View>
            </View>

            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>PIN</Text>
              <TextInput style={s.field} value={pin} onChangeText={setPin} placeholder="······" placeholderTextColor="rgba(255,255,255,0.1)" keyboardType="number-pad" maxLength={6} secureTextEntry />
            </View>

            {error ? <View style={s.err}><Text style={s.errText}>{error}</Text></View> : null}

            <TouchableOpacity style={[s.btn, (!phone||pin.length<6) && s.btnOff]} onPress={handleLogin} disabled={loading||!phone||pin.length<6}>
              <Text style={s.btnText}>{loading ? "..." : "Continue"}</Text>
              <ArrowRight size={18} color="#fff" />
            </TouchableOpacity>

            {isBiometricAvailable && (
              <TouchableOpacity style={s.bio} onPress={handleBio}>
                <Fingerprint size={16} color={ACCENT} /><Text style={s.bioText}>Sign in with fingerprint</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            <TouchableOpacity onPress={() => setStep("phone")}><Text style={s.backLink}>← Back</Text></TouchableOpacity>
            <Text style={s.heading}>Verify{'\n'}your identity</Text>
            <Text style={s.subText}>Enter the code sent to +216 {phone.slice(0,2)} {phone.slice(2,5)} {phone.slice(5)}</Text>

            {devOtp ? (
              <View style={s.otpBox}><Text style={s.otpBoxLabel}>DEV CODE</Text><Text style={s.otpBoxCode}>{devOtp}</Text></View>
            ) : null}

            <TextInput style={[s.field, s.otpField]} value={otp} onChangeText={t => setOtp(t.replace(/\D/g,"").slice(0,6))} placeholder="0 0 0 0 0 0" placeholderTextColor="rgba(255,255,255,0.1)" keyboardType="number-pad" maxLength={6} />

            {error ? <View style={s.err}><Text style={s.errText}>{error}</Text></View> : null}

            <TouchableOpacity style={[s.btn, otp.length<6 && s.btnOff]} onPress={handleOtp} disabled={loading||otp.length<6}>
              <Text style={s.btnText}>Verify</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => router.push("/register")} style={{ marginTop: 40 }}>
          <Text style={s.footerLink}>No account? <Text style={{ color: ACCENT, fontWeight: "700" }}>Create one</Text></Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A14" },
  content: { flex: 1, paddingHorizontal: 28, justifyContent: "center", maxWidth: 440, width: "100%", alignSelf: "center" },
  logo: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 48 },
  logoBox: { width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(255,107,53,0.1)", borderWidth: 1.5, borderColor: "rgba(255,107,53,0.2)", flexDirection: "row", gap: 4, alignItems: "center", justifyContent: "center", padding: 4 },
  logoDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT },
  brand: { fontSize: 20, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  heading: { fontSize: 34, fontWeight: "900", color: "#fff", letterSpacing: -1, lineHeight: 38, marginBottom: 28 },
  subText: { fontSize: 14, color: "rgba(255,255,255,0.3)", marginBottom: 20, lineHeight: 20 },
  fieldWrap: { marginBottom: 18 },
  fieldLabel: { fontSize: 10, fontWeight: "800", color: "rgba(255,255,255,0.2)", letterSpacing: 2, marginBottom: 8 },
  phoneRow: { flexDirection: "row", gap: 10 },
  prefix: { backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 14, paddingHorizontal: 14, justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  prefixText: { color: "rgba(255,255,255,0.35)", fontSize: 14, fontWeight: "600" },
  field: { flex: 1, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 16, fontSize: 16, color: "#fff", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", fontWeight: "500" },
  otpField: { fontSize: 28, textAlign: "center", letterSpacing: 10, fontWeight: "700" },
  otpBox: { backgroundColor: "rgba(255,107,53,0.06)", borderRadius: 14, padding: 14, alignItems: "center", marginBottom: 16, borderWidth: 1, borderColor: "rgba(255,107,53,0.1)" },
  otpBoxLabel: { fontSize: 9, fontWeight: "800", color: "rgba(255,107,53,0.4)", letterSpacing: 2 },
  otpBoxCode: { fontSize: 22, fontWeight: "800", color: ACCENT, letterSpacing: 4, fontFamily: "monospace", marginTop: 4 },
  err: { backgroundColor: "rgba(255,80,80,0.06)", borderRadius: 12, padding: 14, marginTop: 8, marginBottom: 8, borderWidth: 1, borderColor: "rgba(255,80,80,0.1)" },
  errText: { color: "#ff5050", fontSize: 13, textAlign: "center", fontWeight: "600" },
  btn: { backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 },
  btnOff: { opacity: 0.2 },
  btnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  bio: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 24 },
  bioText: { color: ACCENT, fontSize: 13, fontWeight: "600" },
  backLink: { color: "rgba(255,255,255,0.3)", fontSize: 14, marginBottom: 16 },
  footerLink: { textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 14 },
});
