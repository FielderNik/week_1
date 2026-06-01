package com.appapp

import java.nio.file.Files
import java.nio.file.Path
import java.util.Properties

fun loadDeepSeekApiKey(): String {
    val fromEnv = System.getenv("DEEPSEEK_API_KEY")?.trim().orEmpty()
    if (fromEnv.isNotBlank()) return fromEnv

    findFileUpwards("local.properties")?.let { localProperties ->
        readProperty(localProperties, "deepseek.api.key")?.let { return it }
    }

    findFileUpwards(".env")?.let { envFile ->
        readEnvValue(envFile, "DEEPSEEK_API_KEY")?.let { return it }
    }

    error(
        "DeepSeek API key is not configured. " +
            "Set DEEPSEEK_API_KEY, add deepseek.api.key to local.properties, or add DEEPSEEK_API_KEY to .env."
    )
}

private fun findFileUpwards(fileName: String): Path? {
    var directory: Path? = Path.of("").toAbsolutePath()

    while (directory != null) {
        val candidate = directory.resolve(fileName)
        if (Files.exists(candidate)) return candidate

        directory = directory.parent
    }

    return null
}

private fun readProperty(path: Path, key: String): String? {
    val properties = Properties()
    Files.newInputStream(path).use(properties::load)

    return properties.getProperty(key)?.trim()?.takeIf { it.isNotBlank() }
}

private fun readEnvValue(path: Path, key: String): String? =
    Files.readAllLines(path)
        .asSequence()
        .map { it.trim() }
        .filter { it.isNotBlank() && !it.startsWith("#") }
        .mapNotNull { line ->
            val separatorIndex = line.indexOf('=')
            if (separatorIndex == -1) return@mapNotNull null

            val envKey = line.take(separatorIndex).trim()
            val envValue = line.drop(separatorIndex + 1).trim().trim('"', '\'')

            if (envKey == key) envValue.takeIf { it.isNotBlank() } else null
        }
        .firstOrNull()
