import { View, Text, ScrollView, StyleSheet } from "react-native";
import { ExternalLink } from "lucide-react-native";

export default function DocsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>API Documentation</Text>
      <Text style={styles.sub}>Integrate payments with the NexaPay REST API or SDK</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Node.js SDK</Text>
        <Text style={styles.code}>npm install @nexapay/node-sdk</Text>
        <Text style={styles.desc}>Create payment intents, process payments, manage webhooks — full TypeScript support.</Text>
        <View style={styles.link}><ExternalLink size={12} color="#00d4aa" /><Text style={styles.linkText}>npmjs.com/package/@nexapay/node-sdk</Text></View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>REST API</Text>
        <Text style={styles.code}>https://backend.nexapay.space</Text>
        <Text style={styles.desc}>All requests use X-API-Key header for authentication. Webhooks signed with HMAC-SHA256.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Test Cards (Sandbox)</Text>
        {[["4242 4242 4242 4242", "Success (Visa)"], ["5555 5555 5555 4444", "Success (MasterCard)"], ["4000 0000 0000 0002", "Declined"], ["4000 0000 0000 9995", "Insufficient Funds"]].map(([n, r]) => (
          <View key={n} style={styles.testRow}><Text style={styles.testNum}>{n}</Text><Text style={styles.testResult}>{r}</Text></View>
        ))}
      </View>

      <Text style={styles.footer}>contact@backendglitch.com</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0b" },
  content: { padding: 24, paddingTop: 60 },
  heading: { fontSize: 28, fontWeight: "700", color: "#fff" },
  sub: { fontSize: 14, color: "rgba(255,255,255,0.4)", marginTop: 4, marginBottom: 24 },
  card: { backgroundColor: "#111", borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#fff", marginBottom: 8 },
  code: { fontSize: 13, color: "#00d4aa", fontFamily: "monospace", backgroundColor: "rgba(0,212,170,0.08)", padding: 8, borderRadius: 8, marginBottom: 8 },
  desc: { fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 18 },
  link: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  linkText: { fontSize: 12, color: "#00d4aa" },
  testRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  testNum: { fontSize: 13, color: "#fff", fontFamily: "monospace" },
  testResult: { fontSize: 13, color: "rgba(255,255,255,0.4)" },
  footer: { textAlign: "center", color: "#333", fontSize: 12, marginTop: 32 },
});
