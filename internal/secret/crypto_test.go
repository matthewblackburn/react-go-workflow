package secret

import (
	"bytes"
	"testing"
)

func TestDeriveKey_Deterministic(t *testing.T) {
	k1 := DeriveKey("my-secret-key")
	k2 := DeriveKey("my-secret-key")
	if !bytes.Equal(k1, k2) {
		t.Error("same input should produce same key")
	}
	if len(k1) != 32 {
		t.Errorf("key length = %d, want 32", len(k1))
	}
}

func TestDeriveKey_DifferentInputs(t *testing.T) {
	k1 := DeriveKey("key-a")
	k2 := DeriveKey("key-b")
	if bytes.Equal(k1, k2) {
		t.Error("different inputs should produce different keys")
	}
}

func TestEncryptDecrypt_RoundTrip(t *testing.T) {
	key := DeriveKey("test-encryption-key")
	plaintext := []byte("super-secret-api-key-12345")

	encrypted, err := Encrypt(plaintext, key)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	if bytes.Equal(encrypted, plaintext) {
		t.Error("encrypted should differ from plaintext")
	}

	decrypted, err := Decrypt(encrypted, key)
	if err != nil {
		t.Fatalf("Decrypt: %v", err)
	}

	if !bytes.Equal(decrypted, plaintext) {
		t.Errorf("decrypted = %q, want %q", decrypted, plaintext)
	}
}

func TestDecrypt_WrongKey(t *testing.T) {
	key1 := DeriveKey("key-one")
	key2 := DeriveKey("key-two")

	encrypted, err := Encrypt([]byte("secret"), key1)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	_, err = Decrypt(encrypted, key2)
	if err == nil {
		t.Error("expected error when decrypting with wrong key")
	}
}

func TestDecrypt_TooShort(t *testing.T) {
	key := DeriveKey("test")
	_, err := Decrypt([]byte("short"), key)
	if err == nil {
		t.Error("expected error for short ciphertext")
	}
}

func TestEncrypt_DifferentNonces(t *testing.T) {
	key := DeriveKey("test")
	plaintext := []byte("same-value")

	e1, _ := Encrypt(plaintext, key)
	e2, _ := Encrypt(plaintext, key)

	if bytes.Equal(e1, e2) {
		t.Error("encrypting same plaintext twice should produce different ciphertext (random nonce)")
	}
}
