package com.appapp

import kotlinx.coroutines.runBlocking

fun main(): Unit = runBlocking {
    val apiKey = loadDeepSeekApiKey()

    print("Enter prompt: ")
    val prompt = readlnOrNull()?.trim().orEmpty()

    if (prompt.isBlank()) {
        println("Prompt is empty.")
        return@runBlocking
    }

    createHttpClient().use { httpClient ->
        val deepSeekClient = DeepSeekClient(httpClient = httpClient, apiKey = apiKey)

        runCatching {
            deepSeekClient.ask(prompt)
        }.onSuccess { answer ->
            println()
            println(answer)
        }.onFailure { error ->
            println("DeepSeek request failed: ${error.message}")
        }
    }
}
