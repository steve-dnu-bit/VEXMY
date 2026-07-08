<?php

if (!defined('ABSPATH')) {
    exit;
}

final class Velbok_2FA_Login {
    public static function init(): void {
        add_filter('authenticate', [self::class, 'filter_authenticate'], 100, 3);
        add_action('login_form', [self::class, 'render_login_field']);
        add_action('login_enqueue_scripts', [self::class, 'enqueue_assets']);
        add_filter('login_message', [self::class, 'filter_login_message']);
    }

    public static function enqueue_assets(): void {
        wp_enqueue_style(
            'velbok-2fa-login',
            VELBOK_2FA_URL . 'assets/login.css',
            [],
            VELBOK_2FA_VERSION
        );
    }

    public static function filter_authenticate($user, $username, $password) {
        if (is_wp_error($user) || !($user instanceof WP_User)) {
            return $user;
        }

        if (!Velbok_2FA::is_enabled_for_user($user->ID)) {
            return $user;
        }

        $code = isset($_POST['velbok_2fa_code'])
            ? sanitize_text_field(wp_unslash($_POST['velbok_2fa_code']))
            : '';

        if ($code === '') {
            return new WP_Error(
                'velbok_2fa_required',
                __('<strong>Error:</strong> Enter the 6-digit code from Google Authenticator, or a backup code.', 'velbok-2fa')
            );
        }

        $secret = Velbok_2FA::get_secret_for_user($user->ID);
        if (Velbok_2FA_TOTP::verify_code($secret, $code)) {
            return $user;
        }

        if (Velbok_2FA_Backup_Codes::verify_and_consume($user->ID, $code)) {
            return $user;
        }

        return new WP_Error(
            'velbok_2fa_invalid',
            __('<strong>Error:</strong> Invalid authentication code.', 'velbok-2fa')
        );
    }

    public static function render_login_field(): void {
        ?>
        <p class="velbok-2fa-login-field">
            <label for="velbok_2fa_code"><?php esc_html_e('Authentication code', 'velbok-2fa'); ?></label>
            <input
                type="text"
                name="velbok_2fa_code"
                id="velbok_2fa_code"
                class="input"
                value=""
                autocomplete="one-time-code"
                inputmode="text"
                placeholder="<?php esc_attr_e('6-digit code or backup code', 'velbok-2fa'); ?>"
            />
        </p>
        <p class="velbok-2fa-login-help">
            <?php esc_html_e('Use Google Authenticator, or a one-time backup code if you do not have your phone.', 'velbok-2fa'); ?>
        </p>
        <?php
    }

    public static function filter_login_message(string $message): string {
        if (!isset($_GET['velbok_2fa']) || $_GET['velbok_2fa'] !== '1') {
            return $message;
        }

        return $message . '<p class="message velbok-2fa-login-message">' . esc_html__(
            'Two-factor authentication is enabled on your account.',
            'velbok-2fa'
        ) . '</p>';
    }
}
