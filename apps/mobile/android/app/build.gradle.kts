import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val signingProperties = Properties().apply {
    val source = rootProject.file("key.properties")
    if (source.exists()) source.inputStream().use { load(it) }
}
fun signingValue(environment: String, property: String): String? =
    System.getenv(environment)?.takeIf { it.isNotBlank() }
        ?: signingProperties.getProperty(property)?.takeIf { it.isNotBlank() }
val signingPath = signingValue("LUME_KEYSTORE_PATH", "storeFile")
val signingPassword = signingValue("LUME_KEYSTORE_PASSWORD", "storePassword")
val signingAlias = signingValue("LUME_KEY_ALIAS", "keyAlias")
val signingKeyPassword = signingValue("LUME_KEY_PASSWORD", "keyPassword")
val releaseConfigured = listOf(signingPath, signingPassword, signingAlias, signingKeyPassword).all { it != null }
if (gradle.startParameter.taskNames.any { it.contains("release", ignoreCase = true) &&
        !it.contains("test", ignoreCase = true) } && !releaseConfigured) {
    throw GradleException("Assinatura institucional ausente. Configure android/key.properties ou as variáveis LUME_KEYSTORE_*/LUME_KEY_*; builds debug continuam disponíveis.")
}

android {
    namespace = "br.gov.ro.lume.lume_navegador"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion
    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "br.gov.ro.lume.lume_navegador"
        minSdk = 24
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (releaseConfigured) create("institutional") {
            storeFile = rootProject.file(signingPath!!)
            storePassword = signingPassword
            keyAlias = signingAlias
            keyPassword = signingKeyPassword
        }
    }
    buildTypes {
        release {
            if (releaseConfigured) signingConfig = signingConfigs.getByName("institutional")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}

val verifyVoiceModel by tasks.registering {
    doLast {
        val manifest = file("src/main/assets/voice-model-pt/manifest.json")
        if (!manifest.isFile || !manifest.readText().contains("6e1ce909032e1afa7a88e68a3d628ecafff302bdf195befab308826c395e93b7")) {
            throw GradleException("Modelo de voz offline ausente. Execute node scripts/prepare-voice-model.mjs na raiz do repositório antes do build Android.")
        }
    }
}
tasks.named("preBuild") { dependsOn(verifyVoiceModel) }

dependencies {
    implementation("com.alphacephei:vosk-android:0.3.75")
    implementation("net.java.dev.jna:jna:5.18.1@aar")
    testImplementation("junit:junit:4.13.2")
    // Flutter integration_test also includes a debug runner; align both consistent classpaths.
    debugImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:core-ktx:1.6.1")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
}

flutter {
    source = "../.."
}
