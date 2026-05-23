use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::{Digest, Sha256};
use thiserror::Error;

#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum CryptoError {
    #[error("hex decode error")]
    Hex(#[from] hex::FromHexError),
    #[error("invalid key length")]
    InvalidKeyLength,
    #[error("signature error")]
    Signature,
    #[error("encryption error")]
    Encryption,
    #[error("decryption error")]
    Decryption,
}

pub fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

pub fn generate_keypair() -> (String, String) {
    let signing = SigningKey::generate(&mut OsRng);
    let private_hex = hex::encode(signing.to_bytes());
    let public_hex = hex::encode(signing.verifying_key().to_bytes());
    (private_hex, public_hex)
}

pub fn sign_hex(private_key_hex: &str, message: &str) -> Result<String, CryptoError> {
    let private_key_bytes = hex::decode(private_key_hex)?;
    let key_bytes: [u8; 32] = private_key_bytes
        .try_into()
        .map_err(|_| CryptoError::InvalidKeyLength)?;
    let signing = SigningKey::from_bytes(&key_bytes);
    let signature = signing.sign(message.as_bytes());
    Ok(hex::encode(signature.to_bytes()))
}

pub fn verify_signature(public_key_hex: &str, message: &str, signature_hex: &str) -> bool {
    let public_key_bytes = match hex::decode(public_key_hex) {
        Ok(bytes) => bytes,
        Err(_) => return false,
    };
    let key_bytes: [u8; 32] = match public_key_bytes.try_into() {
        Ok(bytes) => bytes,
        Err(_) => return false,
    };
    let verifying = match VerifyingKey::from_bytes(&key_bytes) {
        Ok(v) => v,
        Err(_) => return false,
    };

    let signature_bytes = match hex::decode(signature_hex) {
        Ok(bytes) => bytes,
        Err(_) => return false,
    };
    let sig_bytes: [u8; 64] = match signature_bytes.try_into() {
        Ok(bytes) => bytes,
        Err(_) => return false,
    };
    let signature = Signature::from_bytes(&sig_bytes);

    verifying.verify(message.as_bytes(), &signature).is_ok()
}

pub fn address_from_public_key(public_key_hex: &str) -> String {
    let hash = sha256_hex(public_key_hex.as_bytes());
    format!("NXP{}", &hash[..32])
}

/// Verify a block's multi-signature quorum. Returns true if enough distinct validators
/// from the provided `validator_pubkeys` set have produced valid signatures.
pub fn verify_multi_signature(
    block_hash: &str,
    signatures: &[crate::block::ValidatorSignature],
    validator_pubkeys: &std::collections::HashMap<String, String>, // address -> pubkey hex
    quorum: usize,
) -> bool {
    let mut valid_sigs = 0usize;
    let mut seen = std::collections::HashSet::new();

    for sig in signatures {
        // Deduplicate by address
        if seen.contains(&sig.validator_address) {
            continue;
        }
        seen.insert(sig.validator_address.clone());

        // Look up the validator's public key
        let pubkey = match validator_pubkeys.get(&sig.validator_address) {
            Some(pk) => pk.clone(),
            None => {
                // Also try the embedded public key in the signature itself
                if !sig.validator_public_key.is_empty() {
                    sig.validator_public_key.clone()
                } else {
                    continue;
                }
            }
        };

        if verify_signature(&pubkey, block_hash, &sig.signature) {
            valid_sigs += 1;
        }
    }

    valid_sigs >= quorum
}

// ─── User transaction signing ───

/// Derive a 32-byte encryption key from the user's PIN using Argon2id.
/// This key encrypts/decrypts the user's Ed25519 private key.
/// If `stored_salt` is provided (new random-per-user salt), it is used directly.
/// Otherwise falls back to deterministic derivation from chain_address + pepper.
pub fn derive_user_key_encryption_key(
    chain_address: &str,
    pin: &str,
    pepper: &str,
    stored_salt: Option<&str>,
) -> Result<[u8; 32], CryptoError> {
    use argon2::{
        password_hash::{PasswordHasher, SaltString},
        Argon2,
    };

    let salt = if let Some(existing) = stored_salt {
        SaltString::from_b64(existing).map_err(|_| CryptoError::Encryption)?
    } else {
        let salt_str = format!("nexapay.userkey.{}:{}", chain_address, pepper);
        let mut hasher = Sha256::new();
        hasher.update(salt_str.as_bytes());
        let digest = hasher.finalize();
        let mut salt_bytes = [0u8; 16];
        salt_bytes.copy_from_slice(&digest[..16]);
        SaltString::encode_b64(&salt_bytes).map_err(|_| CryptoError::Encryption)?
    };

    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(pin.as_bytes(), &salt)
        .map_err(|_| CryptoError::Encryption)?;

    let hash_str = hash.to_string();
    let hash_bytes = sha256_hex(hash_str.as_bytes());
    let mut key = [0u8; 32];
    let decoded = hex::decode(&hash_bytes).map_err(|_| CryptoError::InvalidKeyLength)?;
    key.copy_from_slice(&decoded[..32]);
    Ok(key)
}

/// Encrypt a user's Ed25519 private key (hex string) with their PIN-derived key.
/// Returns base64-encoded ciphertext.
pub fn encrypt_user_private_key(
    private_key_hex: &str,
    encryption_key: &[u8; 32],
) -> Result<String, CryptoError> {
    let key_bytes = hex::decode(private_key_hex)?;
    if key_bytes.len() != 32 {
        return Err(CryptoError::InvalidKeyLength);
    }
    let cipher = Aes256Gcm::new_from_slice(encryption_key).map_err(|_| CryptoError::Encryption)?;
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, key_bytes.as_slice())
        .map_err(|_| CryptoError::Encryption)?;
    let mut payload = nonce_bytes.to_vec();
    payload.extend(ciphertext);
    Ok(base64::engine::general_purpose::STANDARD.encode(payload))
}

/// Decrypt a user's Ed25519 private key with their PIN-derived key.
/// Returns the private key as a hex string.
pub fn decrypt_user_private_key(
    encrypted_b64: &str,
    encryption_key: &[u8; 32],
) -> Result<String, CryptoError> {
    let payload = base64::engine::general_purpose::STANDARD
        .decode(encrypted_b64)
        .map_err(|_| CryptoError::Decryption)?;
    if payload.len() < 13 {
        return Err(CryptoError::Decryption);
    }
    let nonce = Nonce::from_slice(&payload[..12]);
    let ciphertext = &payload[12..];
    let cipher = Aes256Gcm::new_from_slice(encryption_key).map_err(|_| CryptoError::Decryption)?;
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::Decryption)?;
    Ok(hex::encode(plaintext))
}

/// Sign a transaction hash with a user's Ed25519 private key.
/// Returns the hex-encoded signature (128 hex chars = 64 bytes).
pub fn sign_transaction_with_user_key(
    private_key_hex: &str,
    tx_hash: &str,
) -> Result<String, CryptoError> {
    sign_hex(private_key_hex, tx_hash)
}

/// Generate a new Ed25519 keypair for a user.
/// Returns (private_key_hex, public_key_hex).
#[allow(dead_code)]
pub fn generate_user_keypair() -> (String, String) {
    generate_keypair()
}

/// Parse a hex-encoded Ed25519 private key into (private_hex, public_hex, address).
/// Does NOT derive from seed — the key must be provided via env var.
pub fn validator_keypair_from_hex_key(private_hex: &str) -> Result<(String, String, String), String> {
    let key_bytes = hex::decode(private_hex)
        .map_err(|e| format!("Invalid validator key hex: {e}"))?;
    if key_bytes.len() != 32 {
        return Err(format!("Validator key must be 32 bytes (64 hex chars), got {}", key_bytes.len()));
    }
    let arr: [u8; 32] = key_bytes.try_into().map_err(|_| "Invalid key length".to_string())?;
    let signing = SigningKey::from_bytes(&arr);
    let pk_hex = hex::encode(signing.verifying_key().to_bytes());
    let address = address_from_public_key(&pk_hex);
    Ok((private_hex.to_string(), pk_hex, address))
}

/// On-chain onboarding digest (commitment over login id, name, DOB).
pub fn registration_digest(login_id: &str, full_name: &str, dob: &str) -> String {
    sha256_hex(format!("{}{}{}", login_id, full_name, dob).as_bytes())
}

/// Hash a transaction PIN using Argon2id (memory-hard KDF).
/// Uses chain_address as salt, pepper as secret pepper for defense-in-depth.
/// Returns format: "argon2id:$hex_hash" for new hashes,
/// or "sha256:$hex_hash" for legacy (pre-migration) hashes.
/// Generate a random B64-encoded salt for per-user PIN/key derivation.
pub fn generate_pin_salt() -> String {
    use argon2::password_hash::SaltString;
    let mut salt_bytes = [0u8; 16];
    OsRng.fill_bytes(&mut salt_bytes);
    SaltString::encode_b64(&salt_bytes)
        .unwrap_or_else(|_| SaltString::from_b64("AAAAAAAAAAAAAAAAAAAAAA").unwrap())
        .to_string()
}

pub fn hash_transaction_pin(chain_address: &str, pin: &str, pepper: &str, stored_salt: Option<&str>) -> String {
    use argon2::{
        password_hash::{PasswordHasher, SaltString},
        Argon2,
    };

    let salt = if let Some(existing) = stored_salt {
        SaltString::from_b64(existing).unwrap_or_else(|_| SaltString::from_b64("AAAAAAAAAAAAAAAAAAAAAA").unwrap())
    } else {
        let salt_str = format!("nexapay.pin.{}:{}", chain_address, pepper);
        let mut hasher = Sha256::new();
        hasher.update(salt_str.as_bytes());
        let digest = hasher.finalize();
        let mut salt_bytes = [0u8; 16];
        salt_bytes.copy_from_slice(&digest[..16]);
        SaltString::encode_b64(&salt_bytes).unwrap_or_else(|_| SaltString::from_b64("AAAAAAAAAAAAAAAAAAAAAA").unwrap())
    };

    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(pin.as_bytes(), &salt)
        .map(|h| h.to_string())
        .unwrap_or_default();

    format!("argon2id:{}", hash)
}

/// Verify a transaction PIN against its stored hash.
/// Supports both legacy SHA-256 hashes and new Argon2id hashes.
/// Returns (is_valid, needs_upgrade) — if needs_upgrade is true, caller should
/// re-hash the PIN to Argon2id and update the stored hash.
pub fn verify_transaction_pin(
    chain_address: &str,
    pin: &str,
    pepper: &str,
    stored_hash: &str,
) -> (bool, bool) {
    if stored_hash.starts_with("argon2id:") {
        use argon2::{
            password_hash::{PasswordHash, PasswordVerifier},
            Argon2,
        };
        let hash_str = &stored_hash["argon2id:".len()..];
        let parsed = match PasswordHash::new(hash_str) {
            Ok(h) => h,
            Err(_) => return (false, false),
        };
        let argon2 = Argon2::default();
        (
            argon2.verify_password(pin.as_bytes(), &parsed).is_ok(),
            false, // already Argon2id, no upgrade needed
        )
    } else {
        // Legacy SHA-256 fallback
        use crate::crypto::sha256_hex;
        let legacy = sha256_hex(
            format!("txpin:{}:{}:{}", chain_address, pin, pepper).as_bytes(),
        );
        (legacy == stored_hash, true) // needs upgrade to Argon2id
    }
}

/// Check if a stored PIN hash uses the legacy SHA-256 format and needs upgrade.
#[allow(dead_code)]
pub fn pin_needs_upgrade(stored_hash: &str) -> bool {
    !stored_hash.is_empty() && !stored_hash.starts_with("argon2id:")
}

#[allow(dead_code)]
pub fn generate_api_key(prefix: &str) -> (String, String, String) {
    let mut random = [0u8; 32];
    OsRng.fill_bytes(&mut random);
    let entropy = sha256_hex(&random);
    let plain = format!("{}{}", prefix, &entropy[..32]);
    let hash = sha256_hex(plain.as_bytes());
    let display_prefix = plain.chars().take(8).collect::<String>();
    (plain, hash, display_prefix)
}

pub fn encrypt_aes256_gcm(key_hex: &str, plaintext: &str) -> Result<String, CryptoError> {
    let key_bytes = hex::decode(key_hex)?;
    if key_bytes.len() != 32 {
        return Err(CryptoError::InvalidKeyLength);
    }

    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|_| CryptoError::Encryption)?;
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|_| CryptoError::Encryption)?;

    let mut payload = nonce_bytes.to_vec();
    payload.extend(ciphertext);
    Ok(base64::engine::general_purpose::STANDARD.encode(payload))
}

pub fn decrypt_aes256_gcm(key_hex: &str, payload_b64: &str) -> Result<String, CryptoError> {
    let key_bytes = hex::decode(key_hex)?;
    if key_bytes.len() != 32 {
        return Err(CryptoError::InvalidKeyLength);
    }

    let payload = base64::engine::general_purpose::STANDARD
        .decode(payload_b64)
        .map_err(|_| CryptoError::Decryption)?;
    if payload.len() < 13 {
        return Err(CryptoError::Decryption);
    }

    let nonce = Nonce::from_slice(&payload[..12]);
    let ciphertext = &payload[12..];
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|_| CryptoError::Decryption)?;
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::Decryption)?;

    String::from_utf8(plaintext).map_err(|_| CryptoError::Decryption)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sign_and_verify_roundtrip() {
        let (sk, pk) = generate_keypair();
        let msg = "nexapay-test";
        let sig = sign_hex(&sk, msg).expect("signature should be generated");
        assert!(verify_signature(&pk, msg, &sig));
    }

    #[test]
    fn encrypt_and_decrypt_roundtrip() {
        let key = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
        let plain = "4111111111111111";
        let enc = encrypt_aes256_gcm(key, plain).expect("should encrypt");
        let dec = decrypt_aes256_gcm(key, &enc).expect("should decrypt");
        assert_eq!(dec, plain);
    }
}
