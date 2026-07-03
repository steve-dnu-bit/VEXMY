<?php

if (!defined('ABSPATH')) {
    exit;
}

final class Velbok_2FA_Backup_Codes {
    public static function regenerate_for_user(int $user_id): array {
        $plain = [];
        $hashed = [];

        for ($i = 0; $i < Velbok_2FA::BACKUP_CODE_COUNT; $i++) {
            $code = self::random_code();
            $plain[] = $code;
            $hashed[] = wp_hash_password($code);
        }

        update_user_meta($user_id, Velbok_2FA::META_BACKUP_CODES, $hashed);

        return $plain;
    }

    public static function remaining_count(int $user_id): int {
        $stored = get_user_meta($user_id, Velbok_2FA::META_BACKUP_CODES, true);
        return is_array($stored) ? count($stored) : 0;
    }

    public static function verify_and_consume(int $user_id, string $input): bool {
        $input = self::normalize($input);
        if ($input === '') {
            return false;
        }

        $stored = get_user_meta($user_id, Velbok_2FA::META_BACKUP_CODES, true);
        if (!is_array($stored) || $stored === []) {
            return false;
        }

        foreach ($stored as $index => $hash) {
            if (!is_string($hash)) {
                continue;
            }

            if (wp_check_password($input, $hash)) {
                unset($stored[$index]);
                update_user_meta($user_id, Velbok_2FA::META_BACKUP_CODES, array_values($stored));
                return true;
            }
        }

        return false;
    }

    private static function random_code(): string {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $parts = [];

        for ($part = 0; $part < 2; $part++) {
            $segment = '';
            for ($i = 0; $i < 4; $i++) {
                $segment .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }
            $parts[] = $segment;
        }

        return implode('-', $parts);
    }

    private static function normalize(string $input): string {
        $input = strtoupper(preg_replace('/\s+/', '', $input));
        if (preg_match('/^[A-Z0-9]{8}$/', $input)) {
            return substr($input, 0, 4) . '-' . substr($input, 4, 4);
        }

        return preg_match('/^[A-Z0-9]{4}-[A-Z0-9]{4}$/', $input) ? $input : '';
    }
}
