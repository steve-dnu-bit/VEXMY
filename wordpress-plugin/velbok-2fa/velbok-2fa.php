<?php
/**
 * Plugin Name: Velbok 2FA
 * Plugin URI: https://velbok.com
 * Description: Two-factor authentication with Google Authenticator (TOTP) and one-time backup codes.
 * Version: 1.0.0
 * Author: Velbok
 * License: GPL-2.0-or-later
 * Text Domain: velbok-2fa
 * Requires at least: 6.0
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) {
    exit;
}

define('VELBOK_2FA_VERSION', '1.0.0');
define('VELBOK_2FA_PATH', plugin_dir_path(__FILE__));
define('VELBOK_2FA_URL', plugin_dir_url(__FILE__));

require_once VELBOK_2FA_PATH . 'includes/class-velbok-totp.php';
require_once VELBOK_2FA_PATH . 'includes/class-velbok-crypto.php';
require_once VELBOK_2FA_PATH . 'includes/class-velbok-backup-codes.php';
require_once VELBOK_2FA_PATH . 'includes/class-velbok-user-profile.php';
require_once VELBOK_2FA_PATH . 'includes/class-velbok-login.php';

final class Velbok_2FA {
    public const META_ENABLED = 'velbok_2fa_enabled';
    public const META_SECRET = 'velbok_2fa_secret';
    public const META_BACKUP_CODES = 'velbok_2fa_backup_codes';
    public const META_PENDING_SECRET = 'velbok_2fa_pending_secret';
    public const BACKUP_CODE_COUNT = 10;

    public static function init(): void {
        Velbok_2FA_User_Profile::init();
        Velbok_2FA_Login::init();
    }

    public static function is_enabled_for_user(int $user_id): bool {
        return get_user_meta($user_id, self::META_ENABLED, true) === '1'
            && self::get_secret_for_user($user_id) !== '';
    }

    public static function get_secret_for_user(int $user_id): string {
        $encrypted = get_user_meta($user_id, self::META_SECRET, true);
        if (!is_string($encrypted) || $encrypted === '') {
            return '';
        }

        return Velbok_2FA_Crypto::decrypt($encrypted);
    }

    public static function set_secret_for_user(int $user_id, string $secret): void {
        update_user_meta($user_id, self::META_SECRET, Velbok_2FA_Crypto::encrypt($secret));
    }

    public static function site_label(): string {
        $host = wp_parse_url(home_url(), PHP_URL_HOST);
        return is_string($host) && $host !== '' ? $host : 'WordPress';
    }
}

Velbok_2FA::init();
