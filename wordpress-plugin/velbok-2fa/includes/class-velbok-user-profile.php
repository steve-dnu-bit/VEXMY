<?php

if (!defined('ABSPATH')) {
    exit;
}

final class Velbok_2FA_User_Profile {
    public static function init(): void {
        add_action('show_user_profile', [self::class, 'render']);
        add_action('edit_user_profile', [self::class, 'render']);
        add_action('personal_options_update', [self::class, 'save']);
        add_action('edit_user_profile_update', [self::class, 'save']);
        add_action('admin_enqueue_scripts', [self::class, 'enqueue_assets']);
    }

    public static function enqueue_assets(string $hook): void {
        if (!in_array($hook, ['profile.php', 'user-edit.php'], true)) {
            return;
        }

        wp_enqueue_style(
            'velbok-2fa-admin',
            VELBOK_2FA_URL . 'assets/admin.css',
            [],
            VELBOK_2FA_VERSION
        );
    }

    public static function render(WP_User $user): void {
        if (!self::can_manage_user($user->ID)) {
            return;
        }

        $enabled = Velbok_2FA::is_enabled_for_user($user->ID);
        $pending_secret = get_user_meta($user->ID, Velbok_2FA::META_PENDING_SECRET, true);
        $pending_secret = is_string($pending_secret) ? Velbok_2FA_Crypto::decrypt($pending_secret) : '';
        $backup_remaining = Velbok_2FA_Backup_Codes::remaining_count($user->ID);
        $issuer = Velbok_2FA::site_label();
        $account = $user->user_login;

        settings_errors('velbok_2fa');
        self::maybe_render_backup_codes_notice();
        ?>
        <h2><?php esc_html_e('Two-Factor Authentication', 'velbok-2fa'); ?></h2>
        <table class="form-table velbok-2fa-profile" role="presentation">
            <tr>
                <th scope="row"><?php esc_html_e('Status', 'velbok-2fa'); ?></th>
                <td>
                    <?php if ($enabled) : ?>
                        <span class="velbok-2fa-badge velbok-2fa-badge--on"><?php esc_html_e('Enabled', 'velbok-2fa'); ?></span>
                        <p class="description">
                            <?php
                            printf(
                                /* translators: %d: number of unused backup codes */
                                esc_html(_n('%d backup code remaining.', '%d backup codes remaining.', $backup_remaining, 'velbok-2fa')),
                                (int) $backup_remaining
                            );
                            ?>
                        </p>
                    <?php else : ?>
                        <span class="velbok-2fa-badge velbok-2fa-badge--off"><?php esc_html_e('Disabled', 'velbok-2fa'); ?></span>
                    <?php endif; ?>
                </td>
            </tr>

            <?php if (!$enabled && $pending_secret === '') : ?>
                <tr>
                    <th scope="row"><?php esc_html_e('Setup', 'velbok-2fa'); ?></th>
                    <td>
                        <?php wp_nonce_field('velbok_2fa_begin_setup', 'velbok_2fa_begin_setup_nonce'); ?>
                        <label>
                            <input type="checkbox" name="velbok_2fa_begin_setup" value="1" />
                            <?php esc_html_e('Start Google Authenticator setup on save', 'velbok-2fa'); ?>
                        </label>
                        <p class="description">
                            <?php esc_html_e('You will scan a QR code and confirm with a 6-digit code from your app.', 'velbok-2fa'); ?>
                        </p>
                    </td>
                </tr>
            <?php endif; ?>

            <?php if (!$enabled && $pending_secret !== '') : ?>
                <?php
                $otpauth = Velbok_2FA_TOTP::get_otpauth_uri($pending_secret, $account, $issuer);
                $qr_url = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' . rawurlencode($otpauth);
                ?>
                <tr>
                    <th scope="row"><?php esc_html_e('Scan QR code', 'velbok-2fa'); ?></th>
                    <td>
                        <img
                            class="velbok-2fa-qr"
                            src="<?php echo esc_url($qr_url); ?>"
                            width="200"
                            height="200"
                            alt="<?php esc_attr_e('Authenticator QR code', 'velbok-2fa'); ?>"
                        />
                        <p>
                            <strong><?php esc_html_e('Manual key:', 'velbok-2fa'); ?></strong>
                            <code><?php echo esc_html($pending_secret); ?></code>
                        </p>
                        <p class="description">
                            <?php esc_html_e('Open Google Authenticator, scan the code, then enter the 6-digit code below and save your profile.', 'velbok-2fa'); ?>
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row">
                        <label for="velbok_2fa_confirm_code"><?php esc_html_e('Verification code', 'velbok-2fa'); ?></label>
                    </th>
                    <td>
                        <input
                            type="text"
                            inputmode="numeric"
                            pattern="[0-9]{6}"
                            maxlength="6"
                            class="regular-text"
                            id="velbok_2fa_confirm_code"
                            name="velbok_2fa_confirm_code"
                            autocomplete="one-time-code"
                        />
                        <?php wp_nonce_field('velbok_2fa_confirm_setup', 'velbok_2fa_confirm_setup_nonce'); ?>
                    </td>
                </tr>
            <?php endif; ?>

            <?php if ($enabled) : ?>
                <tr>
                    <th scope="row"><?php esc_html_e('Backup codes', 'velbok-2fa'); ?></th>
                    <td>
                        <?php wp_nonce_field('velbok_2fa_regenerate_codes', 'velbok_2fa_regenerate_codes_nonce'); ?>
                        <label>
                            <input type="checkbox" name="velbok_2fa_regenerate_codes" value="1" />
                            <?php esc_html_e('Generate new backup codes on save (invalidates old ones)', 'velbok-2fa'); ?>
                        </label>
                        <p class="description">
                            <?php esc_html_e('Each backup code works once if you lose access to your authenticator app.', 'velbok-2fa'); ?>
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e('Disable 2FA', 'velbok-2fa'); ?></th>
                    <td>
                        <?php wp_nonce_field('velbok_2fa_disable', 'velbok_2fa_disable_nonce'); ?>
                        <label>
                            <input type="checkbox" name="velbok_2fa_disable" value="1" />
                            <?php esc_html_e('Disable two-factor authentication on save', 'velbok-2fa'); ?>
                        </label>
                        <p>
                            <label for="velbok_2fa_disable_code"><?php esc_html_e('Current authenticator or backup code', 'velbok-2fa'); ?></label><br />
                            <input
                                type="text"
                                class="regular-text"
                                id="velbok_2fa_disable_code"
                                name="velbok_2fa_disable_code"
                                autocomplete="one-time-code"
                            />
                        </p>
                    </td>
                </tr>
            <?php endif; ?>
        </table>
        <?php
    }

    public static function save(int $user_id): void {
        if (!self::can_manage_user($user_id)) {
            return;
        }

        if (
            Velbok_2FA::is_enabled_for_user($user_id)
            && isset($_POST['velbok_2fa_disable'])
            && $_POST['velbok_2fa_disable'] === '1'
        ) {
            self::handle_disable($user_id);
            return;
        }

        if (
            Velbok_2FA::is_enabled_for_user($user_id)
            && isset($_POST['velbok_2fa_regenerate_codes'])
            && $_POST['velbok_2fa_regenerate_codes'] === '1'
        ) {
            self::handle_regenerate_codes($user_id);
            return;
        }

        if (Velbok_2FA::is_enabled_for_user($user_id)) {
            return;
        }

        if (
            isset($_POST['velbok_2fa_begin_setup'])
            && $_POST['velbok_2fa_begin_setup'] === '1'
        ) {
            self::handle_begin_setup($user_id);
            return;
        }

        if (isset($_POST['velbok_2fa_confirm_code'])) {
            self::handle_confirm_setup($user_id);
        }
    }

    private static function handle_begin_setup(int $user_id): void {
        if (
            !isset($_POST['velbok_2fa_begin_setup_nonce'])
            || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['velbok_2fa_begin_setup_nonce'])), 'velbok_2fa_begin_setup')
        ) {
            return;
        }

        $secret = Velbok_2FA_TOTP::generate_secret();
        update_user_meta($user_id, Velbok_2FA::META_PENDING_SECRET, Velbok_2FA_Crypto::encrypt($secret));
        add_settings_error(
            'velbok_2fa',
            'velbok_2fa_setup_started',
            __('Scan the QR code with Google Authenticator, then enter the verification code and update your profile.', 'velbok-2fa'),
            'updated'
        );
    }

    private static function handle_confirm_setup(int $user_id): void {
        if (
            !isset($_POST['velbok_2fa_confirm_setup_nonce'])
            || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['velbok_2fa_confirm_setup_nonce'])), 'velbok_2fa_confirm_setup')
        ) {
            return;
        }

        $pending = get_user_meta($user_id, Velbok_2FA::META_PENDING_SECRET, true);
        $secret = is_string($pending) ? Velbok_2FA_Crypto::decrypt($pending) : '';
        if ($secret === '') {
            add_settings_error('velbok_2fa', 'velbok_2fa_missing_pending', __('Setup was not started. Try again.', 'velbok-2fa'), 'error');
            return;
        }

        $code = isset($_POST['velbok_2fa_confirm_code'])
            ? sanitize_text_field(wp_unslash($_POST['velbok_2fa_confirm_code']))
            : '';

        if (!Velbok_2FA_TOTP::verify_code($secret, $code)) {
            add_settings_error('velbok_2fa', 'velbok_2fa_invalid_code', __('Invalid verification code. Try again.', 'velbok-2fa'), 'error');
            return;
        }

        Velbok_2FA::set_secret_for_user($user_id, $secret);
        update_user_meta($user_id, Velbok_2FA::META_ENABLED, '1');
        delete_user_meta($user_id, Velbok_2FA::META_PENDING_SECRET);

        $plain_codes = Velbok_2FA_Backup_Codes::regenerate_for_user($user_id);
        set_transient(self::backup_codes_transient_key($user_id), $plain_codes, 15 * MINUTE_IN_SECONDS);

        add_settings_error(
            'velbok_2fa',
            'velbok_2fa_enabled',
            __('Two-factor authentication is now enabled. Save your backup codes below — they are shown only once.', 'velbok-2fa'),
            'updated'
        );
    }

    private static function handle_regenerate_codes(int $user_id): void {
        if (
            !isset($_POST['velbok_2fa_regenerate_codes_nonce'])
            || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['velbok_2fa_regenerate_codes_nonce'])), 'velbok_2fa_regenerate_codes')
        ) {
            return;
        }

        $plain_codes = Velbok_2FA_Backup_Codes::regenerate_for_user($user_id);
        set_transient(self::backup_codes_transient_key($user_id), $plain_codes, 15 * MINUTE_IN_SECONDS);

        add_settings_error(
            'velbok_2fa',
            'velbok_2fa_codes_regenerated',
            __('New backup codes were generated. Copy them now — they are shown only once.', 'velbok-2fa'),
            'updated'
        );
    }

    private static function handle_disable(int $user_id): void {
        if (
            !isset($_POST['velbok_2fa_disable_nonce'])
            || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['velbok_2fa_disable_nonce'])), 'velbok_2fa_disable')
        ) {
            return;
        }

        $code = isset($_POST['velbok_2fa_disable_code'])
            ? sanitize_text_field(wp_unslash($_POST['velbok_2fa_disable_code']))
            : '';

        $secret = Velbok_2FA::get_secret_for_user($user_id);
        $valid = Velbok_2FA_TOTP::verify_code($secret, $code)
            || Velbok_2FA_Backup_Codes::verify_and_consume($user_id, $code);

        if (!$valid) {
            add_settings_error('velbok_2fa', 'velbok_2fa_disable_failed', __('Could not disable 2FA. Enter a valid authenticator or backup code.', 'velbok-2fa'), 'error');
            return;
        }

        delete_user_meta($user_id, Velbok_2FA::META_ENABLED);
        delete_user_meta($user_id, Velbok_2FA::META_SECRET);
        delete_user_meta($user_id, Velbok_2FA::META_PENDING_SECRET);
        delete_user_meta($user_id, Velbok_2FA::META_BACKUP_CODES);

        add_settings_error('velbok_2fa', 'velbok_2fa_disabled', __('Two-factor authentication has been disabled.', 'velbok-2fa'), 'updated');
    }

    private static function maybe_render_backup_codes_notice(): void {
        $user_id = get_current_user_id();
        $codes = get_transient(self::backup_codes_transient_key($user_id));
        if (!is_array($codes) || $codes === []) {
            return;
        }

        delete_transient(self::backup_codes_transient_key($user_id));
        ?>
        <div class="notice notice-warning velbok-2fa-backup-codes">
            <p><strong><?php esc_html_e('Save these backup codes now', 'velbok-2fa'); ?></strong></p>
            <p><?php esc_html_e('Each code works once. Store them in a password manager or print them and keep them safe.', 'velbok-2fa'); ?></p>
            <ul class="velbok-2fa-code-list">
                <?php foreach ($codes as $code) : ?>
                    <li><code><?php echo esc_html($code); ?></code></li>
                <?php endforeach; ?>
            </ul>
        </div>
        <?php
    }

    private static function backup_codes_transient_key(int $user_id): string {
        return 'velbok_2fa_show_codes_' . $user_id;
    }

    private static function can_manage_user(int $user_id): bool {
        return get_current_user_id() === $user_id || current_user_can('edit_users');
    }
}
