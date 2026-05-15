use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::{Digest, Sha256};
use thiserror::Error;

#[derive(Debug, Error)]
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

/// On-chain onboarding digest (commitment over login id, name, DOB).
pub fn registration_digest(login_id: &str, full_name: &str, dob: &str) -> String {
    sha256_hex(format!("{}{}{}", login_id, full_name, dob).as_bytes())
}

/// 4-digit transaction PIN stored on `cards.pin_hash` (hex SHA-256).
pub fn hash_transaction_pin(chain_address: &str, pin: &str, pepper: &str) -> String {
    sha256_hex(format!("txpin:{}:{}:{}", chain_address, pin, pepper).as_bytes())
}

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
