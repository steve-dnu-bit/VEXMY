# Capacitor / WebView
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }

# Stripe Terminal Android SDK
-keep class com.stripe.** { *; }
-dontwarn com.stripe.**

# AndroidX
-keep class androidx.** { *; }

# Preserve line numbers for crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
