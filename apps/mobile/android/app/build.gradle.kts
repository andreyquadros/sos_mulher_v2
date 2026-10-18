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
        }
    }
}

dependencies { testImplementation("junit:junit:4.13.2") }

flutter {
    source = "../.."
}
