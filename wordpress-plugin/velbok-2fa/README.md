# Velbok 2FA (WordPress plugin)

Google Authenticator (TOTP) and one-time backup codes for WordPress admin login.

## Install

1. Copy the `velbok-2fa` folder to `wp-content/plugins/` on your server.
2. In WordPress admin go to **Plugins** and activate **Velbok 2FA**.
3. Open **Users → Profile** (your own profile).
4. Check **Start Google Authenticator setup on save** and click **Update Profile**.
5. Scan the QR code with Google Authenticator.
6. Enter the 6-digit verification code and click **Update Profile** again.
7. Copy the **backup codes** shown once and store them safely.

## Login

After 2FA is enabled, the WordPress login screen shows an extra field:

- **6-digit code** from Google Authenticator, or
- **Backup code** (format `XXXX-XXXX`, each code works once)

## Disable 2FA

On your profile page, check **Disable two-factor authentication**, enter your current authenticator or backup code, and save.

## Requirements

- WordPress 6.0+
- PHP 7.4+ with OpenSSL enabled

## Files

- `velbok-2fa.php` — plugin bootstrap
- `includes/class-velbok-totp.php` — TOTP (RFC 6238)
- `includes/class-velbok-backup-codes.php` — hashed one-time backup codes
- `includes/class-velbok-user-profile.php` — setup UI on user profile
- `includes/class-velbok-login.php` — login verification

## Security notes

- TOTP secrets are encrypted with a key derived from `wp_salt('auth')`.
- Backup codes are stored hashed (like passwords) and removed after use.
- Backup codes are shown only once after setup or regeneration.
