# JNA resolves methods and structures dynamically; Vosk also registers native entry points.
# https://github.com/alphacep/vosk-android-demo/blob/master/app/proguard-rules.pro
-keep class com.sun.jna.** { *; }
-keep class org.vosk.** { *; }
-dontwarn java.awt.**
-dontwarn javax.swing.**
