<?php

if (!defined('ABSPATH')) {
    exit;
}

final class Velbok_2FA_Crypto {
    public static function encrypt(string $plaintext): string {
        if ($plaintext === '') {
            return '';
        }

        $key = hash('sha256', wp_salt('auth'), true);
        $iv = random_bytes(16);
        $ciphertext = openssl_encrypt($plaintext, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv);

        if ($ciphertext === false) {
            return '';
        }

        return base64_encode($iv . $ciphertext);
    }

    public static function decrypt(string $encoded): string {
        if ($encoded === '') {
            return '';
        }

        $raw = base64_decode($encoded, true);
        if ($raw === false || strlen($raw) < 17) {
            return '';
        }

        $iv = substr($raw, 0, 16);
        $ciphertext = substr($raw, 16);
        $key = hash('sha256', wp_salt('auth'), true);
        $plaintext = openssl_decrypt($ciphertext, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv);

        return is_string($plaintext) ? $plaintext : '';
    }
}
