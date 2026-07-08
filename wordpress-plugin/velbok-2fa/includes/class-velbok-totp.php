<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * RFC 6238 TOTP (Google Authenticator compatible).
 */
final class Velbok_2FA_TOTP {
    private const PERIOD = 30;
    private const DIGITS = 6;
    private const ALGORITHM = 'sha1';

  /** @var string */
    private static $base32_chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    public static function generate_secret(int $length = 16): string {
        $bytes = random_bytes($length);
        return self::base32_encode($bytes);
    }

    public static function get_otpauth_uri(string $secret, string $account, string $issuer): string {
        $label = rawurlencode($issuer . ':' . $account);
        $params = http_build_query(
            [
                'secret' => $secret,
                'issuer' => $issuer,
                'algorithm' => strtoupper(self::ALGORITHM),
                'digits' => self::DIGITS,
                'period' => self::PERIOD,
            ],
            '',
            '&',
            PHP_QUERY_RFC3986
        );

        return 'otpauth://totp/' . $label . '?' . $params;
    }

    public static function verify_code(string $secret, string $code, int $window = 1): bool {
        $code = preg_replace('/\s+/', '', $code);
        if (!is_string($code) || !preg_match('/^\d{6}$/', $code)) {
            return false;
        }

        $timestamp = time();
        for ($offset = -$window; $offset <= $window; $offset++) {
            $counter = intdiv($timestamp, self::PERIOD) + $offset;
            if (hash_equals(self::code_for_counter($secret, $counter), $code)) {
                return true;
            }
        }

        return false;
    }

    private static function code_for_counter(string $secret, int $counter): string {
        $key = self::base32_decode($secret);
        if ($key === '') {
            return '';
        }

        $binary_counter = pack('N*', 0, $counter);
        $hash = hash_hmac(self::ALGORITHM, $binary_counter, $key, true);
        $offset = ord(substr($hash, -1)) & 0x0f;
        $truncated = substr($hash, $offset, 4);
        $value = unpack('N', $truncated)[1] & 0x7fffffff;
        $modulo = 10 ** self::DIGITS;

        return str_pad((string) ($value % $modulo), self::DIGITS, '0', STR_PAD_LEFT);
    }

    private static function base32_encode(string $data): string {
        if ($data === '') {
            return '';
        }

        $binary = '';
        foreach (str_split($data) as $char) {
            $binary .= str_pad(decbin(ord($char)), 8, '0', STR_PAD_LEFT);
        }

        $chunks = str_split($binary, 5);
        $encoded = '';
        foreach ($chunks as $chunk) {
            $chunk = str_pad($chunk, 5, '0', STR_PAD_RIGHT);
            $encoded .= self::$base32_chars[bindec($chunk)];
        }

        return $encoded;
    }

    private static function base32_decode(string $data): string {
        $data = strtoupper(preg_replace('/[^A-Z2-7]/', '', $data));
        if ($data === '') {
            return '';
        }

        $binary = '';
        foreach (str_split($data) as $char) {
            $pos = strpos(self::$base32_chars, $char);
            if ($pos === false) {
                return '';
            }
            $binary .= str_pad(decbin($pos), 5, '0', STR_PAD_LEFT);
        }

        $bytes = '';
        foreach (str_split($binary, 8) as $byte) {
            if (strlen($byte) < 8) {
                break;
            }
            $bytes .= chr(bindec($byte));
        }

        return $bytes;
    }
}
